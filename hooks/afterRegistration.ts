import { METHOD_CODE } from '../index'

export function afterRegistration({ Vue, config, store, isServer }) {
  // Update the methods
  let paymentMethodConfig = {
    'title': 'Stripe',
    'code': METHOD_CODE,
    'cost': 0,
    'costInclTax': 0,
    'default': false,
    'offline': false,
    'is_server_method': config.stripe.backend_method_code ? true : false
  }
  store.dispatch('payment/addMethod', paymentMethodConfig)

  if (!isServer) {
    // Load the stripe.js elements script.
    let apiUrl = 'https://js.stripe.com/v3/'
    let docHead = document.getElementsByTagName('head')[0]
    let docScript = document.createElement('script')
    docScript.type = 'text/javascript'
    docScript.src = apiUrl
    docScript.onload = () => {
      Vue.prototype.$bus.$emit('stripe-payments-ready')
    }
    docHead.appendChild(docScript)
  }
}
