import type {Parent, Literal} from 'unist'
import type {Plugin, Transformer as UnifiedTransformer} from 'unified'
import parse5 from 'parse5'
import fromParse5 from 'hast-util-from-parse5'
import visit from 'unist-util-visit'

type GottenHTML = string | null
type TransformerConfig<Type = unknown> = Type

type Transformer<ConfigType = unknown> = {
  getHTML: (
    url: string,
    config?: TransformerConfig<ConfigType>,
  ) => Promise<GottenHTML> | GottenHTML
  shouldTransform: (url: string) => Promise<boolean> | boolean
  name: string
}

type RemarkEmbedderOptions = {
  cache?:
    | Map<string, GottenHTML>
    // the gatsby cache is async, and we want to support that so:
    | {
        get(key: string): Promise<GottenHTML>
        set(key: string, value: GottenHTML): Promise<void>
        [key: string]: unknown
      }
  transformers: Array<[Transformer<any>, TransformerConfig] | Transformer<any>>
}

// results in an AST node of type "root" with a single "children" node of type "element"
// so we return the first (and only) child "element" node
const htmlToHast = (string: string): Parent =>
  (fromParse5(parse5.parseFragment(string)) as Parent).children[0] as Parent

const getUrlString = (url: string): string | null => {
  const urlString = url.startsWith('http') ? url : `https://${url}`

  try {
    return new URL(urlString).toString()
  } catch (error: unknown) {
    return null
  }
}

const remarkEmbedder: Plugin<[RemarkEmbedderOptions]> = ({
  transformers,
  cache,
}: RemarkEmbedderOptions) => {
  // convert the array of transformers to one with both the transformer and the config tuple
  const transformersAndConfig: Array<{
    transformer: Transformer<unknown>
    config?: TransformerConfig
  }> = transformers.map(t => {
    if (Array.isArray(t)) return {transformer: t[0], config: t[1]}
    else return {transformer: t}
  })

  const remarkEmbedderBase: UnifiedTransformer = async tree => {
    const nodeAndURL: Array<{parentNode: Parent; url: string}> = []

    visit(tree, 'paragraph', (paragraphNode: Parent) => {
      if (paragraphNode.children.length !== 1) {
        return
      }

      const {children} = paragraphNode
      const node = children[0] as Parent & Literal
      const isText = node.type === 'text'
      // it's a valid link if there's no title, and the value is the same as the URL
      const isValidLink =
        node.type === 'link' &&
        node.title === null &&
        node.children.length === 1 &&
        node.children[0].value === node.url
      if (!isText && !isValidLink) {
        return
      }

      const {url, value = url} = node

      const urlString = getUrlString(value as string)
      if (!urlString) {
        return
      }
      nodeAndURL.push({parentNode: paragraphNode, url: urlString})
    })

    const nodesToTransform: Array<
      typeof nodeAndURL[0] & typeof transformersAndConfig[0]
    > = []

    for (const node of nodeAndURL) {
      for (const transformerAndConfig of transformersAndConfig) {
        // we need to make sure this is completed in sequence
        // because the order matters
        // eslint-disable-next-line no-await-in-loop
        if (await transformerAndConfig.transformer.shouldTransform(node.url)) {
          nodesToTransform.push({...node, ...transformerAndConfig})
          break
        }
      }
    }

    const promises = nodesToTransform.map(
      async ({parentNode, url, transformer, config}) => {
        try {
          const cacheKey = `remark-embedder:${transformer.name}:${url}`
          let html: GottenHTML | undefined = await cache?.get(cacheKey)

          if (!html) {
            html = await transformer.getHTML(url, config)
            await cache?.set(cacheKey, html)
          }

          // if nothing's returned from getHTML, then no modifications are needed
          if (!html) return

          // convert the HTML string into an AST
          const htmlElement = htmlToHast(html)

          // set the parentNode.data with the necessary properties
          parentNode.data = {
            hName: htmlElement.tagName,
            hProperties: htmlElement.properties,
            hChildren: htmlElement.children,
          }
        } catch (e: unknown) {
          // https://github.com/microsoft/TypeScript/issues/20024#issuecomment-344511199
          const error = e as Error
          error.message = `The following error occurred while processing \`${url}\` with the remark-embedder transformer \`${transformer.name}\`:\n\n${error.message}`

          throw error
        }
      },
    )

    await Promise.all(promises)

    return tree
  }

  return remarkEmbedderBase
}

export default remarkEmbedder
export type {Transformer, RemarkEmbedderOptions}

/*
eslint
  @typescript-eslint/no-explicit-any: "off",
*/
