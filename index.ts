// This is VS module entry point.
// Read more about modules: https://github.com/DivanteLtd/vue-storefront/blob/master/doc/api-modules/about-modules.md
import { afterRegistration } from './hooks/afterRegistration'
import { VueStorefrontModule, VueStorefrontModuleConfig } from '@vue-storefront/core/lib/module'
import config from 'config'

// This key will be used for creating extension keys in vuex and other key-based plugins.
// In case of conflicting keys across modules they'll be merged in favor of the least recently registered one
export const KEY = 'stripe'
export const METHOD_CODE = config.stripe.backend_method_code || KEY

// Put everything that should extend the base app here so it can be later registered as VS module
const moduleConfig: VueStorefrontModuleConfig = {
  key: KEY,
  store: { modules: [{ key: KEY, module: {}}] },
  afterRegistration
}

export const Stripe = new VueStorefrontModule(moduleConfig)
