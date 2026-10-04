export function moduleAllowed(environment, role, module, capabilities) {
  return capabilities.includes(`${module}.access`) &&
    (environment !== 'production' || module === 'production' || ['administrator', 'manager'].includes(role))
}
export function generatorAllowed(environment, capabilities) {
  return environment === 'uat' && capabilities.includes('orders.test.generate')
}
export const runtimeEnvironment = typeof __APP_ENVIRONMENT__ === 'undefined' ? 'development' : __APP_ENVIRONMENT__
