import { test } from 'node:test'
import assert from 'node:assert/strict'
import { scaleRecipe, extendRecipePath } from '../src/recipeScaling.js'

const calculate = (base, requested, gross, unit = 'g') =>
  scaleRecipe({ gramatura: base }, [{ brutto: gross, netto: 999 }], requested, unit)

for (const [base, requested, gross, expected] of [[2000,1000,1000,500],[2000,3000,500,750],[100,500,90,450]]) {
  test(`${gross} × ${requested}/${base} = ${expected}`, () => {
    assert.equal(calculate(base,requested,gross).ingredients[0].requiredGross,expected)
  })
}
test('kg, numeric strings, zero gross and no intermediate rounding', () => {
  assert.equal(calculate('100','0.5','90','kg').ingredients[0].requiredGross,450)
  assert.equal(calculate(100,500,0).ingredients[0].requiredGross,0)
  assert.equal(calculate(3,1,7).ingredients[0].requiredGross,7*(1/3))
})
test('invalid data does not generate a requirement', () => {
  for (const base of [null,undefined,0,-1,'',NaN,Infinity]) assert(calculate(base,500,90).error)
  for (const quantity of [null,undefined,'',-1,NaN,Infinity]) assert(calculate(100,quantity,90).error)
  for (const unit of ['ml','l','szt.']) assert(calculate(100,500,90,unit).error)
  for (const gross of [null,undefined,'',-1,NaN,Infinity]) assert.equal(calculate(100,500,gross).ingredients[0].requiredGross,null)
  assert(scaleRecipe(null,[],500,'g').error)
  assert(scaleRecipe({gramatura:100},[],500,'g').error)
  assert(calculate(Number.MIN_VALUE,Number.MAX_VALUE,90).error)
  assert.equal(calculate(1,2,Number.MAX_VALUE).ingredients[0].requiredGross,null)
})
test('source data unchanged; existing nested recipe can use parent gross', () => {
  const product=Object.freeze({gramatura:100})
  const source=Object.freeze([Object.freeze({brutto:90,netto:1})])
  const parent=scaleRecipe(product,source,500,'g')
  const child=calculate(100,parent.ingredients[0].requiredGross,20)
  assert.equal(child.ingredients[0].requiredGross,90)
  assert.deepEqual(source,[{brutto:90,netto:1}])
  assert.notEqual(parent.ingredients[0],source[0])
})

test('Miodownik → Krem → Śmietana/Mascarpone uses required parent gross', () => {
  const parent = calculate(2000, 2000, 500)
  const cream = scaleRecipe({gramatura:1000}, [{brutto:600},{brutto:400}], parent.ingredients[0].requiredGross, 'g')
  assert.deepEqual(cream.ingredients.map(i => i.requiredGross), [300,200])
})
test('four levels pass unrounded gross; invalid child stops calculation', () => {
  let required = 500
  for (const [base,gross] of [[100,90],[1000,600],[200,50],[100,20]]) {
    required = calculate(base,required,gross).ingredients[0].requiredGross
  }
  assert.equal(required,13.5)
  const invalid = calculate(100,500,null)
  assert(calculate(100,invalid.ingredients[0].requiredGross,90).error)
})
test('branch-local cycle detection, mixed ID types and sibling reuse', () => {
  const root = Object.freeze(['50'])
  const child = extendRecipePath(root, 60)
  const grandchild = extendRecipePath(child, 70)
  assert.equal(extendRecipePath(grandchild, 50), null)
  assert.equal(extendRecipePath(root, '50'), null)
  assert.deepEqual(extendRecipePath(root, 60), ['50','60'])
  assert.deepEqual(extendRecipePath(grandchild, 80), ['50','60','70','80'])
  assert.deepEqual(root, ['50'])
})
