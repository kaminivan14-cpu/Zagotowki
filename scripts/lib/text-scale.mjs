// Scale absolute typography once at build time. Relative em/rem values already
// inherit the scaled root; dimensions, SVGs and layout spacing are untouched.
export function scaleTypography() {
 return {postcssPlugin:'app-text-scale',Declaration(decl){
  if (!['font','font-size','line-height'].includes(decl.prop) || decl.value.includes('--app-font-scale')) return
  decl.value=decl.value.replace(/(?<![\w.-])(\d*\.?\d+)(px|pt|vw|vh)\b/g,'calc($1$2 * var(--app-font-scale, 1))')
 }}
}
