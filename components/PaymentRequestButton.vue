<template>
  <div :id="id">
    <!-- A Stripe Element will be inserted here. -->
  </div>
</template>

<script>
import config from 'config'
import i18n from '@vue-storefront/i18n'

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
      }
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
    }
  },
  mounted () {
    this.configureStripe()
  },
  methods: {
    getTotals () {
      let amount = 0.00

      this.totals.forEach(total => {
        if (total.code !== 'grand_total') {
          amount += total.value
        }
      })

      return {
        label: i18n.t('Total'),
        amount
      }
    },
    getShippingOptions () {
      const shippingOptions = []

      this.availableShippingMethods.forEach(method => {
        shippingOptions.push({
          id: method.method_code,
          label: method.method_title,
          amount: method.price_incl_tax
        })
      })

      return shippingOptions
    },
    configureStripe () {
      if (!config.hasOwnProperty('stripe') || typeof config.stripe.apiKey === 'undefined') {
        return false
      }

      // Create a new Stripe client.
      this.stripe.instance = window.Stripe(config.stripe.apiKey)

      this.stripe.paymentRequest = this.stripe.instance.paymentRequest({
        country: 'US',
        currency: 'usd',
        total: this.getTotals(),
        requestPayerName: true,
        requestPayerEmail: true,
        requestShipping: true,
        shippingOptions: this.getShippingOptions()
      })

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
      console.log(result)
      if (result) {
        this.stripe.button.mount(`#${this.id}`)
      } else {
        document.getElementById(this.id).style.display = 'none'
      }
    },
    bindEventListeners () {
      this.stripe.paymentRequest.on('shippingaddresschange', this.onShippingAddressChange)
      this.stripe.paymentRequest.on('token', this.onTokenReceive)
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
      this.placeOrderWithPayload({token: event.token.id})
    },
    beforeDestroy () {
      this.unbindEventListeners()
    },
    unbindEventListeners () {
      this.stripe.paymentRequest.off('shippingaddresschange', this.onShippingAddressChange)
      this.stripe.paymentRequest.off('token', this.onTokenReceive)
    },
    placeOrderWithPayload (payload) {
      this.$bus.$emit('checkout-do-placeOrder', payload)
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
