<template>

  <div class="mb15 mt20 vsf-stripe-container">
    <h4 class="mt0">
      <label for="vsf-stripe-card-element">
        Credit or debit card
      </label>
    </h4>
    <div class="bg-cl-secondary px20 py20">
      <form action="" id="payment-form">
        <div class="form-row">
          <div v-if="paymentRequestResult" class="flex items-center">
            <svg class="payment-icon mr10"><use :xlink:href="paySystemIcon" /></svg>
            <span class="mr10">{{ paymentRequestResult.card.brand }}</span>
            <span>**** {{ paymentRequestResult.card.last4 }}</span>
          </div>

          <div v-show="!paymentRequestResult" id="vsf-stripe-card-element">
            &nbsp;
            <!-- A Stripe Element will be inserted here. -->
          </div>

          <!-- Used to display Element errors. -->
          <div v-if="errorMessage" id="vsf-stripe-card-errors" role="alert">
            {{ errorMessage }}
          </div>
        </div>
      </form>
    </div>
  </div>

</template>

<script>
import config from 'config'
import i18n from '@vue-storefront/i18n'
import { METHOD_CODE } from '../index'

export default {
  name: 'PaymentStripe',
  data () {
    return {
      stripe: {
        instance: null,
        elements: null,
        card: null
      },
      correctPaymentMethod: true,
      errorMessage: null,
      token: null,
      paymentRequestResult: null
    }
  },
  computed: {
    paySystemIcon () {
      if (!this.paymentRequestResult) {
        return ''
      }

      switch (this.paymentRequestResult.card.brand.toLowerCase()) {
        case 'visa':
          return '#pay_system_visa'

        case 'mastercard':
          return '#pay_system_master_card'

        case 'amex':
          return '#pay_system_american_express'

        case 'discover':
          return '#pay_system_discover'

        default:
          return ''
      }

    }
  },
  beforeMount () {
    this.$bus.$on('checkout-before-placeOrder', this.onBeforePlaceOrder)
    this.$bus.$on('checkout-payment-method-changed', this.checkPaymentMethod)
    this.$bus.$on('stripePR-token-receive', this.onPaymentRequestToken)
    this.$bus.$on('order-after-placed', this.refreshInstance) // Reset stripe token & instance
  },
  beforeDestroy () {
    this.$bus.$off('checkout-before-placeOrder', this.onBeforePlaceOrder)
    this.$bus.$off('checkout-payment-method-changed', this.checkPaymentMethod)
    this.$bus.$off('stripePR-token-receive', this.onPaymentRequestToken)
    this.$bus.$off('order-after-placed', this.refreshInstance)
  },
  mounted () {
    if (window.Stripe) {
      this.configureStripe()
    } else {
      this.$bus.$on('stripe-payments-ready', this.configureStripe)
    }
  },
  methods: {
    refreshInstance () {
      this.configureStripe()
      this.token = null
    },
    checkPaymentMethod (paymentMethodCode) {
      this.correctPaymentMethod = paymentMethodCode === METHOD_CODE
    },
    onBeforePlaceOrder () {
      if (this.correctPaymentMethod && this.token) {
        this.placeOrderWithPayload(this.token)
      }
    },
    configureStripe () {
      this.$bus.$off('stripe-payments-ready', this.configureStripe)
      if (!config.hasOwnProperty('stripe') || typeof config.stripe.apiKey === 'undefined') {
        return false
      }

      // Create a new Stripe client.
      this.stripe.instance = window.Stripe(config.stripe.apiKey)

      // Create an instance of Elements.
      this.stripe.elements = this.stripe.instance.elements()

      // Create the stripe elements card
      this.createElements()

      // Add the event listeners for stripe.
      this.bindEventListeners()
    },
    createElements () {
      let style = (typeof config.stripe.style !== 'undefined') ? config.stripe.style : {}

      // Create an instance of the card Element.
      this.stripe.card = this.stripe.elements.create('card', { style: style })

      // Add an instance of the card Element into the `card-element` <div>.
      this.stripe.card.mount('#vsf-stripe-card-element')
    },
    bindEventListeners () {
      // Handle real-time validation errors from the card Element.
      this.stripe.card.addEventListener('change', this.onStripeCardChange)
    },
    onStripeCardChange (event) {
      this.errorMessage = event.error ? event.error.message : ''
      this.paymentRequestResult = null
    },
    beforeDestroy () {
      this.unbindEventListeners()
    },
    unbindEventListeners () {
      this.stripe.card.removeEventListener('change', this.onStripeCardChange)
    },
    async processStripeForm () {
      if (this.paymentRequestResult && this.token) {
        return true
      }

      this.$bus.$emit('notification-progress-start', [i18n.t('Processing Card Info'), '...'].join(''))

      // Create payment method with Stripe
      const result = await this.stripe.instance.createPaymentMethod('card', this.stripe.card)

      this.$bus.$emit('notification-progress-stop')

      if (result.error) {
        this.errorMessage = result.error.message
        this.$bus.$emit('stripe-payment-error', result.error)
        return false
      } else {
        this.token = this.formatTokenPayload(result)
        return true
      }
    },
    onPaymentRequestToken (token) {
      this.paymentRequestResult = token
      this.token = this.formatTokenPayload({paymentMethod: token})
    },
    placeOrderWithPayload (payload) {
      this.$bus.$emit('checkout-do-placeOrder', {paymentMethod: payload})
    },
    /**
     * Format the returned token data
     * according to the platform's requirements
     * @param {any} token Token data from Stripe
     */
    formatTokenPayload (token) {
      console.log(token)
      let platform = (typeof config.stripe.backend_platform !== 'undefined') ? config.stripe.backend_platform : 'default';

      switch (platform) {
        case 'magento2':
          return token.paymentMethod.id + ':' + token.paymentMethod.card.brand + ':' + token.paymentMethod.card.last4
          break;

        default:
          return token // just return all data if platform not found or specified
          break;
      }
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

    .payment-icon {
      width: 60px;
      height: 40px;
    }

    .mr10 {
      margin-right: 10px;
    }
  }
  #vsf-stripe-card-errors {
    margin: 8px auto 0;
    color: #fa755a;
  }
</style>
