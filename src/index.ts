import type {Node, Parent, Literal} from 'unist'
import parse5 from 'parse5'
import fromParse5 from 'hast-util-from-parse5'
import visit from 'unist-util-visit'

type GottenHTML = string | null
type Transformer = {
  getHTML: (url: string, config?: unknown) => Promise<GottenHTML> | GottenHTML
  shouldTransform: (url: string) => boolean
  name: string
}

type TransformerConfig = unknown

type RemarkEmbedderOptions = {
  cache?:
    | Map<string, GottenHTML>
    // the gatsby cache is async, and we want to support that so:
    | {
        get(key: string): Promise<GottenHTML>
        set(key: string, value: GottenHTML): Promise<void>
        [key: string]: unknown
      }
  transformers: Array<[Transformer, TransformerConfig] | Transformer>
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

const defaultCache = new Map<string, GottenHTML>()

function remarkEmbedder({
  transformers,
  cache = defaultCache,
}: RemarkEmbedderOptions) {
  // convert the array of transformers to one with both the transformer and the config tuple
  const transformersAndConfig: Array<
    [Transformer, TransformerConfig | undefined]
  > = transformers.map(t => {
    if (Array.isArray(t)) return t
    else return [t, undefined]
  })

  return async function remarkEmbedderBase(tree: Node) {
    const transformations: Array<() => Promise<void>> = []
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

      for (const transformerAndConfig of transformersAndConfig) {
        const [{shouldTransform, getHTML, name}, config] = transformerAndConfig
        if (!shouldTransform(urlString)) {
          continue
        }

        transformations.push(async () => {
          try {
            const cacheKey = `remark-embedder:${urlString}`
            let html: GottenHTML | undefined = await cache.get(cacheKey)

            if (!html) {
              html = await getHTML(urlString, config)
              await cache.set(cacheKey, html)
            }

            // if nothing's returned from getHTML, then no modifications are needed
            if (!html) return

            // convert the HTML string into an AST
            const htmlElement = htmlToHast(html)

            // set the paragraphNode.data with the necessary properties
            paragraphNode.data = {
              hName: htmlElement.tagName,
              hProperties: htmlElement.properties,
              hChildren: htmlElement.children,
            }
          } catch (e: unknown) {
            // https://github.com/microsoft/TypeScript/issues/20024#issuecomment-344511199
            const error = e as Error
            error.message = `The following error occurred while processing \`${urlString}\` with the remark-embedder transformer \`${name}\`:\n\n${error.message}`

            throw error
          }
        })
      }
    })

    await Promise.all(transformations.map(t => t()))

    return tree
  }
}

export default remarkEmbedder
export type {Transformer, RemarkEmbedderOptions}

/*
eslint
  no-continue: "off",
*/
