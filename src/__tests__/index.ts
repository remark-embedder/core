import remark from 'remark'
import remarkHTML from 'remark-html'
import remarkEmbedder from '../'
import type {Transformer} from '../'

// this removes the quotes around strings...
const unquoteSerializer = {
  print: (val: unknown) => (val as string).trim(),
  test: (val: string) => typeof val === 'string',
}

expect.addSnapshotSerializer(unquoteSerializer)

const getTransformer = <ConfigType>(
  overrides: Partial<Transformer<ConfigType>> = {},
): Transformer<ConfigType> => ({
  name: 'TEST',
  shouldTransform: jest.fn(url => url.startsWith('https://some-site.com')),
  getHTML: jest.fn(url => `<iframe src="${url}"></iframe>`),
  ...overrides,
})

test('smoke test', async () => {
  const transformer = getTransformer()
  const result = await remark()
    .use(remarkEmbedder, {transformers: [transformer]})
    .use(remarkHTML)
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
  const result = await remark()
    .use(remarkEmbedder, {transformers: [transformer]})
    .use(remarkHTML)
    .process(`[https://some-site.com](https://some-site.com)`)

  expect(result.toString()).toMatchInlineSnapshot(
    `<iframe src="https://some-site.com/"></iframe>`,
  )
})

test('requests are cached', async () => {
  const myCache = new Map()
  const transformer = getTransformer()
  const getHTMLMock = transformer.getHTML as jest.Mock
  await remark()
    .use(remarkEmbedder, {cache: myCache, transformers: [transformer]})
    .use(remarkHTML)
    .process('https://some-site.com')

  expect(getHTMLMock).toHaveBeenCalledTimes(1)
  getHTMLMock.mockClear()

  await remark()
    .use(remarkEmbedder, {cache: myCache, transformers: [transformer]})
    .use(remarkHTML)
    .process('https://some-site.com')

  expect(getHTMLMock).not.toHaveBeenCalled()
})

test(`does nothing with markdown that doesn't match`, async () => {
  const myCache = new Map()
  const transformer = getTransformer()
  const result = await remark()
    .use(remarkEmbedder, {cache: myCache, transformers: [transformer]})
    .use(remarkHTML)
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

[This has a title, so it's not transformed](https://some-site.com)
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
  const error = await remark()
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
    .use(remarkHTML)
    .process(`https://some-site.com/error`)
    .catch(e => e)

  expect(error.message).toMatchInlineSnapshot(`
    The following error occurred while processing \`https://some-site.com/error\` with the remark-embedder transformer \`Error Transformer\`:

    Oh no!
  `)
})

test('transformers can change their mind by returning null', async () => {
  const result = await remark()
    .use(remarkEmbedder, {
      transformers: [
        {
          name: 'No transform',
          getHTML: () => null,
          shouldTransform: () => true,
        },
      ],
    })
    .use(remarkHTML)
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
    getHTML: jest.fn(
      (url, config = getDefaultConfig) =>
        `<div>${config(url).some} for ${url}</div>`,
    ),
  }

  const config = () => ({some: 'config'})
  await remark()
    .use(remarkEmbedder, {
      transformers: [[transformer, config as TConfig]],
    })
    .use(remarkHTML)
    .process('some-site.com/config')

  expect(transformer.getHTML).toHaveBeenCalledWith(
    'https://some-site.com/config',
    config,
  )
})

test('shouldTransform can be async', async () => {
  const transformer = getTransformer({
    shouldTransform: jest.fn(url =>
      Promise.resolve(url.endsWith('transform-me')),
    ),
    getHTML: () => `<div>It changed!</div>`,
  })
  const result = await remark()
    .use(remarkEmbedder, {
      transformers: [transformer],
    })
    .use(remarkHTML).process(`
https://some-site.com/transform-me

https://some-site.com/do-not-transform
`)

  expect(result.toString()).toMatchInlineSnapshot(`
    <div>It changed!</div>
    <p>https://some-site.com/do-not-transform</p>
  `)
})

// no idea why TS and remark aren't getting along here,
// but I don't have time to look into it right now...
/*
eslint
  @typescript-eslint/no-unsafe-assignment: "off",
  @typescript-eslint/no-unsafe-member-access: "off",
  @typescript-eslint/no-unsafe-call: "off"
*/
