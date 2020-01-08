<template>
  <div :id="id" :style="{width}">
    <!-- A Stripe Element will be inserted here. -->
  </div>
</template>

<script>
import config from 'config'
import i18n from '@vue-storefront/i18n'

const USAStates = require('../resources/usa-states.json')

export default {
  name: 'StripePaymentRequestButton',
  props: {
    type: {
      type: String,
      required: false,
      default: 'default',
      validator: function (value) {
        return ['default', 'donate', 'buy'].indexOf(value) !== -1
      }
    },
    theme: {
      type: String,
      required: false,
      default: 'dark',
      validator: function (value) {
        return ['dark', 'light', 'light-outline'].indexOf(value) !== -1
      }
    },
    height: {
      type: Number,
      required: false,
      default: 40
    },
    width: {
      type: String,
      required: false,
      default: '120px'
    },
    requestPersonalDetails: {
      type: Boolean,
      required: false,
      default: true
    },
    savePersonalDetails: {
      type: Boolean,
      required: false,
      default: true
    },
    requestShipping: {
      type: Boolean,
      required: false,
      default: true
    },
    savePaymentDetails: {
      type: Boolean,
      required: false,
      default: true
    }
  },
  data () {
    return {
      id: 'stripe-payment-request-button',
      stripe: {
        instance: null,
        elements: null,
        button: null,
        paymentRequest: null
      },
      correctPaymentMethod: true,
      token: null,
      usaStates: USAStates
    }
  },
  computed: {
    totals () {
      return this.$store.getters['cart/getTotals']
    },
    shippingMethods () {
      return this.$store.getters['shipping/shippingMethods']
    },
    availableShippingMethods () {
      return this.shippingMethods.filter(method => method.available)
    },
    checkoutShippingDetails () {
      return this.$store.state.checkout.shippingDetails
    },
    checkoutPersonalDetails () {
      return this.$store.state.checkout.personalDetails
    },
    checkoutPaymentDetails () {
      return this.$store.state.checkout.paymentDetails
    }
  },
  mounted () {
    if (window.Stripe) {
      this.configureStripe()
    } else {
      this.$bus.$on('stripe-payments-ready', this.configureStripe)
    }
  },
  methods: {
    getTotals (pending = false) {
      let amount = 0.00

      this.totals.forEach(total => {
        if (total.code !== 'grand_total') {
          amount += total.value
        }
      })

      return {
        label: i18n.t('Total'),
        amount: Math.ceil(amount * 100),
        pending
      }
    },
    getDisplayItems (pending = false) {
      return this.totals.filter(total => {
        return total.code !== 'grand_total' && total.title !== ''
      }).map(total => {
        return {
          label: total.title,
          amount: Math.ceil(total.value * 100),
          pending
        }
      })
    },
    getShippingOptions () {
      const shippingOptions = []

      this.availableShippingMethods.forEach(method => {
        shippingOptions.push({
          id: method.method_code,
          label: method.method_title,
          amount: Math.ceil(method.price_incl_tax * 100)
        })
      })

      return shippingOptions
    },
    configureStripe () {
      this.$bus.$off('stripe-payments-ready', this.configureStripe)
      if (!config.hasOwnProperty('stripe') || typeof config.stripe.apiKey === 'undefined') {
        return false
      }

      // Create a new Stripe client.
      this.stripe.instance = window.Stripe(config.stripe.apiKey)

      let options = {
        country: 'US',
        currency: 'usd',
        total: this.getTotals(true),
        displayItems: this.getDisplayItems(true),
        requestPayerName: this.requestPersonalDetails,
        requestPayerEmail: this.requestPersonalDetails,
        requestPayerPhone: this.requestPersonalDetails,
        requestShipping: this.requestShipping
      }

      if (this.requestShipping) {
        options.shippingOptions = this.getShippingOptions()
      }

      this.stripe.paymentRequest = this.stripe.instance.paymentRequest(options)

      // Create an instance of Elements.
      this.stripe.elements = this.stripe.instance.elements()

      // Create the stripe elements Payment Request Button
      this.createElements()

      // Add the event listeners for stripe.
      this.bindEventListeners()
    },
    async createElements () {
      // Create an instance of the Payment Request Button Element.
      this.stripe.button = this.stripe.elements.create('paymentRequestButton', {
        paymentRequest: this.stripe.paymentRequest,
        style: {
          paymentRequestButton: {
            type: this.type,
            theme: this.theme,
            height: this.height + 'px'
          }
        }
      })

      // Check the availability of the Payment Request API first.
      const result = await this.stripe.paymentRequest.canMakePayment()

      if (result) {
        this.stripe.button.mount(`#${this.id}`)
      } else {
        document.getElementById(this.id).style.display = 'none'
      }
    },
    bindEventListeners () {
      if (this.requestShipping) {
        this.stripe.paymentRequest.on('shippingaddresschange', this.onShippingAddressChange)
      }
      this.stripe.paymentRequest.on('paymentmethod', this.onTokenReceive)
      this.stripe.button.on('click', this.updateDetails)
    },
    async onShippingAddressChange (event) {
      const lastShipping = this.checkoutShippingDetails

      const stateCode = this.getStateCode(event.shippingAddress.region)

      if (!stateCode) {
        this.$store.dispatch('notification/spawnNotification', {
          type: 'error',
          message: i18n.t('Please fill out the state for your shipping address'),
          action1: { label: i18n.t('OK') }
        })

        event.updateWith({status: 'invalid_shipping_address'})
        return false
      }

      this.updateShippingDetails(event.shippingAddress, null, false)
      await this.$store.dispatch('cart/syncTotals', { forceServerSync: true })

      if (this.getShippingOptions().length > 0) {
        event.updateWith({
          status: 'success',
          total: this.getTotals(),
          displayItems: this.getDisplayItems(),
          shippingOptions: this.getShippingOptions()
        })
      } else {
        this.$store.dispatch('checkout/saveShippingDetails', lastShipping)
        event.updateWith({status: 'invalid_shipping_address'})
      }
    },
    onTokenReceive (event) {
      if (this.requestPersonalDetails && this.savePersonalDetails) {
        this.updatePersonalDetails({
          email: event.payerEmail,
          name: event.payerName
        })
      }
      if (this.requestShipping) {
        const updatedShippingDetails = this.updateShippingDetails(event.shippingAddress, event.shippingOption)
        if (!updatedShippingDetails) {
          return false
        }
      }
      if (this.savePaymentDetails) {
        const updatedPaymentDetails = this.updatePaymentDetails(event.paymentMethod.billing_details)
        if (!updatedPaymentDetails) {
          return false
        }
      }
      this.$bus.$emit('stripePR-token-receive', event)
      event.complete('success')
    },
    beforeDestroy () {
      this.unbindEventListeners()
    },
    unbindEventListeners () {
      if (this.requestShipping) {
        this.stripe.paymentRequest.off('shippingaddresschange', this.onShippingAddressChange)
      }
      this.stripe.paymentRequest.off('paymentmethod', this.onTokenReceive)
      this.stripe.button.off('click', this.updateDetails)
    },
    updateDetails () {
      let options = {
        total: this.getTotals(),
        displayItems: this.getDisplayItems()
      }

      if (this.requestShipping) {
        options.shippingOptions = this.getShippingOptions()
      }

      this.stripe.paymentRequest.update(options)
    },
    updatePersonalDetails (personalDetails, emitEvent = true) {
      this.$bus.$emit('stripePR-personalDetails-update', personalDetails)
      let name = personalDetails.name.split(' ', 2)
      let details = {
        firstName: name[0],
        lastName: name.length > 1 ? name[1] : '',
        emailAddress: personalDetails.email
      }

      this.$store.dispatch('checkout/savePersonalDetails', details)
      if (emitEvent) {
        this.$bus.$emit('checkout-after-personalDetails', this.checkoutPersonalDetails, {})
      }
    },
    updateShippingDetails (shippingAddress, shippingOption = null, emitEvent = true) {
      const stateCode = this.getStateCode(shippingAddress.region)

      if (!stateCode) {
        this.$store.dispatch('notification/spawnNotification', {
          type: 'error',
          message: i18n.t('Please fill out the state for your shipping address'),
          action1: { label: i18n.t('OK') }
        })

        return false
      }

      this.$bus.$emit('stripePR-shippingDetails-update', { shippingAddress, shippingOption})
      let name = shippingAddress.recipient.split(' ', 2)
      let address = {
        firstName: name[0],
        lastName: name.length > 1 ? name[1] : '',
        country: shippingAddress.country,
        state: stateCode,
        city: shippingAddress.city,
        streetAddress: shippingAddress.addressLine[0],
        apartmentNumber: shippingAddress.addressLine.length > 1 ? shippingAddress.addressLine[1] : '',
        zipCode: shippingAddress.postalCode,
        phoneNumber: shippingAddress.phone
      }

      let shipping

      if (shippingOption) {
        shipping = {
          ...address,
          shippingMethod: shippingOption.id,
          shippingCarrier: shippingOption.id
        }
      } else {
        shipping = {
          ...address,
          shippingMethod: this.checkoutShippingDetails.shippingMethod,
          shippingCarrier: this.checkoutShippingDetails.shippingCarrier
        }
      }

      this.$store.dispatch('checkout/saveShippingDetails', shipping)
      if (emitEvent) {
        this.$bus.$emit('checkout-after-shippingDetails', this.checkoutShippingDetails, {})
      }

      return true
    },
    updatePaymentDetails (paymentDetails, emitEvent = true) {
      const stateCode = this.getStateCode(paymentDetails.address.state)

      if (!stateCode) {
        this.$store.dispatch('notification/spawnNotification', {
          type: 'error',
          message: i18n.t('Please fill out the state for your billing address'),
          action1: { label: i18n.t('OK') }
        })

        return false
      }

      this.$bus.$emit('stripePR-paymentDetails-update', paymentDetails)
      let name = paymentDetails.name.split(' ', 2)
      let address = {
        firstName: name[0],
        lastName: name.length > 1 ? name[1] : '',
        country: paymentDetails.address.country,
        state: paymentDetails.address.state,
        city: paymentDetails.address.city,
        streetAddress: paymentDetails.address.line1,
        apartmentNumber: paymentDetails.address.line2,
        zipCode: paymentDetails.address.postal_code,
        phoneNumber: paymentDetails.phone
      }

      let payment = {
        ...address,
        paymentMethod: this.checkoutPaymentDetails.paymentMethod,
        paymentMethodAdditional: this.checkoutPaymentDetails.paymentMethodAdditional
      }

      this.$store.dispatch('checkout/savePaymentDetails', payment)
      if (emitEvent) {
        this.$bus.$emit('checkout-after-paymentDetails', this.checkoutPaymentDetails, {})
      }

      return true
    },
    getStateCode (stateStr) {
      if (stateStr.length < 2) {
        return false
      }

      if (stateStr.length === 2) {
        return stateStr
      }

      const stateCode = this.usaStates.find((el) => {
        return el.name === stateStr.trim()
      })

      return (stateCode.code) ? stateCode.code : false
    }
  }
}
</script>

<style lang="scss" scoped>

  .vsf-stripe-container {
    label {
      font-weight: 500;
      font-size: 14px;
      display: block;
      margin-bottom: 8px;
      color: #818992;
    }

    .StripeElement {
      background-color: white;
      padding: 10px 12px;
      border-radius: 4px;
      border: 1px solid transparent;
      box-shadow: 0 1px 3px 0 #e6ebf1;
      -webkit-transition: box-shadow 150ms ease;
      transition: box-shadow 150ms ease;
    }

    .StripeElement--focus {
      box-shadow: 0 1px 3px 0 #cfd7df;
    }

    .StripeElement--invalid {
      border-color: #fa755a;
    }

    .StripeElement--webkit-autofill {
      background-color: #fefde5 !important;
    }
  }
  #vsf-stripe-card-errors {
    margin: 8px auto 0;
    color: #fa755a;
  }
</style>
