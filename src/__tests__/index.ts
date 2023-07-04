import {afterEach, expect, vi, test} from 'vitest'
import type {Mock} from 'vitest'
import remarkEmbedder from '../'
import type {Transformer} from '../'

// this removes the quotes around strings...
const unquoteSerializer = {
  serialize: (val: string) => val.trim(),
  test: (val: unknown) => typeof val === 'string',
}

expect.addSnapshotSerializer(unquoteSerializer)

const consoleError = vi.spyOn(console, 'error')
afterEach(() => {
  expect(consoleError).not.toHaveBeenCalled()
  consoleError.mockReset()
})

const getTransformer = <ConfigType>(
  overrides: Partial<Transformer<ConfigType>> = {},
): Transformer<ConfigType> => ({
  name: 'TEST',
  shouldTransform: vi.fn(url => url.startsWith('https://some-site.com')),
  getHTML: vi.fn(url => `<iframe src="${url}"></iframe>`),
  ...overrides,
})

test('smoke test', async () => {
  const transformer = getTransformer()
  const result = await (
    await import('remark')
  )
    .remark()
    .use(remarkEmbedder, {transformers: [transformer]})
    .use((await import('remark-html')).default, {sanitize: false})
    .process(
      `
This is a great site:

https://some-site.com
      `.trim(),
    )

  expect(result.toString()).toMatchInlineSnapshot(`
    <p>This is a great site:</p>
    <iframe src="https://some-site.com/"></iframe>
  `)
})

test('works with same name as link links', async () => {
  const transformer = getTransformer()
  const result = await (
    await import('remark')
  )
    .remark()
    .use(remarkEmbedder, {transformers: [transformer]})
    .use((await import('remark-html')).default, {sanitize: false})
    .process(`[https://some-site.com](https://some-site.com)`)

  expect(result.toString()).toMatchInlineSnapshot(
    `<iframe src="https://some-site.com/"></iframe>`,
  )
})

test('requests are cached', async () => {
  const myCache = new Map()
  const transformer = getTransformer()
  const getHTMLMock = transformer.getHTML as Mock
  await (
    await import('remark')
  )
    .remark()
    .use(remarkEmbedder, {cache: myCache, transformers: [transformer]})
    .use((await import('remark-html')).default, {sanitize: false})
    .process('https://some-site.com')

  expect(getHTMLMock).toHaveBeenCalledTimes(1)
  getHTMLMock.mockClear()

  await (
    await import('remark')
  )
    .remark()
    .use(remarkEmbedder, {cache: myCache, transformers: [transformer]})
    .use((await import('remark-html')).default, {sanitize: false})
    .process('https://some-site.com')

  expect(getHTMLMock).not.toHaveBeenCalled()
})

test(`does nothing with markdown that doesn't match`, async () => {
  const myCache = new Map()
  const transformer = getTransformer()
  const result = await (
    await import('remark')
  )
    .remark()
    .use(remarkEmbedder, {cache: myCache, transformers: [transformer]})
    .use((await import('remark-html')).default, {sanitize: false})
    .process(
      `
# This is

a regular

<div>
  Markdown file
</div>

https://example.com

That's just a regular link

And so is this: [neat](https://www.youtube.com/watch?v=dQw4w9WgXcQ)

[This text is not the same as the url, so it's not transformed](https://some-site.com)

[https://some-site.com](https://some-site.com "This one has a title, so it's not transformed")

This one has an emphasised text, so it's not transformed:

[**https://some-site.com**](https://some-site.com)
      `.trim(),
    )

  expect(myCache.size).toBe(0)
  expect(transformer.getHTML).not.toHaveBeenCalled()
  expect(transformer.shouldTransform).toHaveBeenCalledTimes(1)
  expect(transformer.shouldTransform).toHaveReturnedWith(false)

  // make sure no links were made into embeds
  expect(result.toString()).not.toMatch(/iframe/i)
})

test('error messages are handy', async () => {
  const error = await (
    await import('remark')
  )
    .remark()
    .use(remarkEmbedder, {
      transformers: [
        {
          name: 'Error Transformer',
          getHTML: () => {
            throw new Error('Oh no!')
          },
          shouldTransform: () => true,
        },
      ],
    })
    .use((await import('remark-html')).default, {sanitize: false})
    .process(`https://some-site.com/error`)
    .catch(e => e)

  expect(error.message).toMatchInlineSnapshot(`
    The following error occurred while processing \`https://some-site.com/error\` with the remark-embedder transformer \`Error Transformer\`:

    Oh no!
  `)
})

test('transformers can change their mind by returning null', async () => {
  const result = await (
    await import('remark')
  )
    .remark()
    .use(remarkEmbedder, {
      transformers: [
        {
          name: 'No transform',
          getHTML: () => null,
          shouldTransform: () => true,
        },
      ],
    })
    .use((await import('remark-html')).default, {sanitize: false})
    .process('https://some-site.com/no-change')

  expect(result.toString()).toMatchInlineSnapshot(
    `<p>https://some-site.com/no-change</p>`,
  )
})

test('transformers can be configured', async () => {
  type TConfig = (url: string) => {some: string}

  // the default config thing is here to help test the types...
  const getDefaultConfig = () => ({some: 'defaultConfig'})
  const transformer: Transformer<TConfig> = {
    name: 'TEST',
    shouldTransform: () => true,
    getHTML: vi.fn(
      (url, config = getDefaultConfig) =>
        `<div>${config(url).some} for ${url}</div>`,
    ),
  }

  const config = () => ({some: 'config'})
  await (
    await import('remark')
  )
    .remark()
    .use(remarkEmbedder, {
      transformers: [[transformer, config as TConfig]],
    })
    .use((await import('remark-html')).default, {sanitize: false})
    .process('some-site.com/config')

  expect(transformer.getHTML).toHaveBeenCalledWith(
    'https://some-site.com/config',
    config,
  )
})

test('shouldTransform can be async', async () => {
  const transformer = getTransformer({
    shouldTransform: vi.fn(url =>
      Promise.resolve(url.endsWith('transform-me')),
    ),
    getHTML: () => `<div>It changed!</div>`,
  })
  const result = await (
    await import('remark')
  )
    .remark()
    .use(remarkEmbedder, {
      transformers: [transformer],
    })
    .use((await import('remark-html')).default, {sanitize: false}).process(`
https://some-site.com/transform-me

https://some-site.com/do-not-transform
`)

  expect(result.toString()).toMatchInlineSnapshot(`
    <div>It changed!</div>
    <p>https://some-site.com/do-not-transform</p>
  `)
})

test('handleHTML returns html', async () => {
  const transformer = getTransformer()
  const handleHTML = vi.fn(html => `<div>${html}</div>`)
  const result = await (
    await import('remark')
  )
    .remark()
    .use(remarkEmbedder, {transformers: [transformer], handleHTML})
    .use((await import('remark-html')).default, {sanitize: false})
    .process(`[https://some-site.com](https://some-site.com)`)

  expect(result.toString()).toMatchInlineSnapshot(
    `<div><iframe src="https://some-site.com/"></iframe></div>`,
  )
})

test('handleHTML gets null', async () => {
  const handleHTML = vi.fn(() => null)
  const result = await (
    await import('remark')
  )
    .remark()
    .use(remarkEmbedder, {
      transformers: [
        {
          name: 'No transform',
          getHTML: () => null,
          shouldTransform: () => true,
        },
      ],
      handleHTML,
    })
    .use((await import('remark-html')).default, {sanitize: false})
    .process(`[https://some-site.com](https://some-site.com)`)

  expect(result.toString()).toMatchInlineSnapshot(
    `<p><a href="https://some-site.com">https://some-site.com</a></p>`,
  )
})

test('handleHTML works when requests are cached', async () => {
  const myCache = new Map()
  const transformer = getTransformer()
  const getHTMLMock = transformer.getHTML as Mock
  await (
    await import('remark')
  )
    .remark()
    .use(remarkEmbedder, {cache: myCache, transformers: [transformer]})
    .use((await import('remark-html')).default, {sanitize: false})
    .process('https://some-site.com')

  expect(getHTMLMock).toHaveBeenCalledTimes(1)
  getHTMLMock.mockClear()

  const handleHTML = vi.fn(html => `<div>${html}</div>`)
  const result = await (
    await import('remark')
  )
    .remark()
    .use(remarkEmbedder, {cache: myCache, transformers: [transformer], handleHTML})
    .use((await import('remark-html')).default, {sanitize: false})
    .process(`[https://some-site.com](https://some-site.com)`)

  expect(result.toString()).toMatchInlineSnapshot(
    `<div><iframe src="https://some-site.com/"></iframe></div>`,
  )

  expect(getHTMLMock).not.toHaveBeenCalled()
})

test('can handle errors', async () => {
  consoleError.mockImplementationOnce(() => {})
  const transformer = getTransformer({
    getHTML: () => Promise.reject(new Error('OH_NO_AN_ERROR_HAPPENED')),
  })
  const handleError = vi.fn(({error}) => `<div>${error.message}</div>`)
  const result = await (
    await import('remark')
  )
    .remark()
    .use(remarkEmbedder, {transformers: [transformer], handleError})
    .use((await import('remark-html')).default, {sanitize: false})
    .process(`[https://some-site.com](https://some-site.com)`)

  expect(result.toString()).toMatchInlineSnapshot(
    `<div>OH_NO_AN_ERROR_HAPPENED</div>`,
  )

  expect(consoleError).toHaveBeenCalledTimes(1)
  expect(consoleError).toHaveBeenCalledWith(expect.any(String))
  expect(consoleError.mock.calls[0][0]).toMatchInlineSnapshot(`
    The following error occurred while processing \`https://some-site.com/\` with the remark-embedder transformer \`TEST\`:

    OH_NO_AN_ERROR_HAPPENED
  `)
  consoleError.mockClear()
})

test('handleError can return null', async () => {
  consoleError.mockImplementationOnce(() => {})
  const transformer = getTransformer({
    getHTML: () => Promise.reject(new Error('OH_NO_AN_ERROR_HAPPENED')),
  })
  const handleError = vi.fn(() => null)
  const result = await (
    await import('remark')
  )
    .remark()
    .use(remarkEmbedder, {transformers: [transformer], handleError})
    .use((await import('remark-html')).default, {sanitize: false})
    .process(`[https://some-site.com](https://some-site.com)`)

  expect(result.toString()).toMatchInlineSnapshot(
    `<p><a href="https://some-site.com">https://some-site.com</a></p>`,
  )
  consoleError.mockClear()
})

// no idea why TS and remark aren't getting along here,
// but I don't have time to look into it right now...
/*
eslint
  @typescript-eslint/no-unsafe-assignment: "off",
  @typescript-eslint/no-unsafe-member-access: "off"
*/
