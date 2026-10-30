import assert from 'node:assert/strict'
import { register } from 'node:module'
import { test } from 'node:test'
register('./swc-loader.mjs', import.meta.url)
const { createProjectMediaQueue } = await import('../lib/projectMediaQueue.ts')
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r }); return { promise, resolve } }

test('upload completion appends to the latest deletion and main-image order', async () => {
  let images = ['main', 'second', 'removed']
  const read = deferred()
  const add = createProjectMediaQueue(4, () => images.length, () => read.promise, values => { images = [...images, ...values] })
  const result = add(['new'])
  images = ['second', 'main']
  read.resolve('new')
  await result
  assert.deepEqual(images, ['second', 'main', 'new'])
})

test('concurrent reads reserve slots and preserve file and batch selection order', async () => {
  let images = []
  const reads = [deferred(), deferred(), deferred()]
  const add = createProjectMediaQueue(3, () => images.length, i => reads[i].promise, values => { images.push(...values) })
  const first = add([0, 1])
  const second = add([2])
  assert.equal(await add([3]), false)
  reads[2].resolve('third'); reads[1].resolve('second'); reads[0].resolve('first')
  await Promise.all([first, second])
  assert.deepEqual(images, ['first', 'second', 'third'])
})

test('failed reads release reservations and do not stall later video uploads', async () => {
  let videos = []
  const add = createProjectMediaQueue(1, () => videos.length, file => file === 'bad' ? Promise.reject(new Error('read failed')) : Promise.resolve(file), values => { videos.push(...values) })
  assert.equal(await add(['bad']), true)
  assert.equal(await add(['video']), true)
  assert.equal(await add(['other']), false)
  assert.deepEqual(videos, ['video'])
})
