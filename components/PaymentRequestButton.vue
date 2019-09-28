<template>
  <div :id="id" :style="{width}">
    <!-- A Stripe Element will be inserted here. -->
  </div>
</template>

<script>
import config from 'config'
import i18n from '@vue-storefront/i18n'
import { METHOD_CODE } from '../index'

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
    requestShipping: {
      type: Boolean,
      required: false,
      default: false
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
      token: null
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
    checkoutPaymentDetails () {
      return this.$store.state.checkout.paymentDetails
    },
    checkoutShippingDetails () {
      return this.$store.state.checkout.shippingDetails
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
        amount: amount * 100,
        pending
      }
    },
    getDisplayItems (pending = false) {
      return this.totals.filter(total => {
        return total.code !== 'grand_total' && total.title !== ''
      }).map(total => {
        return {
          label: total.title,
          amount: total.value * 100,
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
          amount: method.price_incl_tax * 100
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
        requestPayerName: true,
        requestPayerEmail: true,
        requestPayerPhone: true,
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
      if (event.shippingAddress.country !== 'US') {
        event.updateWith({status: 'invalid_shipping_address'})
      } else {
        // Perform server-side request to fetch shipping options
        // const response = await fetch('/calculateShipping', {
        //   data: JSON.stringify({
        //     shippingAddress: event.shippingAddress
        //   })
        // })
        // const result = await response.json()

        event.updateWith({
          status: 'success',
          shippingOptions: this.getShippingOptions() // result.supportedShippingOptions
        })
      }
    },
    onTokenReceive (event) {
      if (this.requestShipping) {
        this.updateShippingDetails(event.shippingAddress, event.shippingOption)
      }
      // Use this if you need to map more parameters from the response
      debugger;
      this.$bus.$emit('stripePR-event-receive', event)
      this.$bus.$emit('stripePR-token-receive', event.paymentMethod)
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
        displayItems: this.getDisplayItems(),
      }

      if (this.requestShipping) {
        options.shippingOptions = this.getShippingOptions()
      }

      this.stripe.paymentRequest.update(options)
    },
    updateShippingDetails (shippingAddress, shippingOption) {
      this.$bus.$emit('stripePR-shipping-select', {shippingAddress, shippingOption})
      let name = shippingAddress.recipient.split(' ', 2)
      let address = {
        firstName: name[0],
        lastName: name.length > 1 ? name[1] : '',
        country: shippingAddress.country,
        state: shippingAddress.region,
        city: shippingAddress.city,
        streetAddress: shippingAddress.addressLine[0],
        apartmentNumber: shippingAddress.addressLine.length > 1 ? shippingAddress.addressLine[1] : '',
        zipCode: shippingAddress.postalCode,
        phoneNumber: shippingAddress.phone
      }

      const shipping = {
        ...address,
        shippingMethod: shippingOption.id,
        shippingCarrier: shippingOption.id
      }
      this.$store.dispatch('checkout/saveShippingDetails', shipping)
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
