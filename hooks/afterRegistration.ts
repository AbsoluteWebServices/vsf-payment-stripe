export function afterRegistration({ Vue, config, store, isServer }) {
  const VSF_PAYMENT_CODE = config.stripe.backend_method_code || 'stripe'

  // Update the methods
  let paymentMethodConfig = {
    'title': 'Stripe',
    'code': VSF_PAYMENT_CODE,
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
    docHead.appendChild(docScript)
  }
}
