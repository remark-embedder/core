import fromParse5 from 'hast-util-from-parse5'
import parse5 from 'parse5'
import type {Plugin} from 'unified'
import type {Literal, Parent} from 'unist'
import visit from 'unist-util-visit'

type GottenHTML = string | null
type TransformerConfig<Type = unknown> = Type

type Transformer<ConfigType = unknown> = {
  getHTML: (
    url: string,
    config?: TransformerConfig<ConfigType>,
  ) => GottenHTML | Promise<GottenHTML>
  name: string
  shouldTransform: (url: string) => Promise<boolean> | boolean
}

type RemarkEmbedderOptions = {
  cache?:
    | Map<string, GottenHTML>
    // the Gatsby cache is async, and we want to support that so:
    | {
        get(key: string): Promise<GottenHTML>
        set(key: string, value: GottenHTML): Promise<void>
        [key: string]: unknown
      }
  transformers: Array<Transformer<any> | [Transformer<any>, TransformerConfig]>
  handleHTML?: (
    html: GottenHTML,
    info: {
      url: string
      transformer: Transformer<unknown>
      config: TransformerConfig
    },
  ) => GottenHTML | Promise<GottenHTML>
  handleError?: (errorInfo: {
    error: Error
    url: string
    transformer: Transformer<unknown>
    config: TransformerConfig
  }) => GottenHTML | Promise<GottenHTML>
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
  cache,
  transformers,
  handleHTML,
  handleError,
}) => {
  // convert the array of transformers to one with both the transformer and the config tuple
  const transformersAndConfig: Array<{
    config?: TransformerConfig
    transformer: Transformer
  }> = transformers.map(t =>
    Array.isArray(t) ? {config: t[1], transformer: t[0]} : {transformer: t},
  )

  return async tree => {
    const nodeAndURL: Array<{parentNode: Parent; url: string}> = []

    visit(tree, 'paragraph', (paragraphNode: Parent) => {
      if (paragraphNode.children.length !== 1) {
        return
      }

      const {children} = paragraphNode
      const node = children[0] as Literal & Parent
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
        const errorMessageBanner = `The following error occurred while processing \`${url}\` with the remark-embedder transformer \`${transformer.name}\`:`
        try {
          const cacheKey = `remark-embedder:${transformer.name}:${url}`
          let html: GottenHTML | undefined = await cache?.get(cacheKey)

          if (!html) {
            try {
              html = await transformer.getHTML(url, config)
              html = html?.trim() ?? null
              await cache?.set(cacheKey, html)

              // optional handleHTML transform function
              if (handleHTML) {
                html = await handleHTML(html, {url, transformer, config})
                html = html?.trim() ?? null
              }
            } catch (e: unknown) {
              if (handleError) {
                const error = e as Error
                console.error(`${errorMessageBanner}\n\n${error.message}`)
                html = await handleError({error, url, transformer, config})
                html = html?.trim() ?? null
              } else {
                throw e
              }
            }
          }

          // if nothing's returned from getHTML, then no modifications are needed
          if (!html) {
            return
          }

          // convert the HTML string into an AST
          const htmlElement = htmlToHast(html)

          // set the parentNode.data with the necessary properties
          parentNode.data = {
            hChildren: htmlElement.children,
            hName: htmlElement.tagName,
            hProperties: htmlElement.properties,
          }
        } catch (e: unknown) {
          const error = e as Error
          error.message = `${errorMessageBanner}\n\n${error.message}`

          throw error
        }
      },
    )

    await Promise.all(promises)

    return tree
  }
}

export default remarkEmbedder
export type {RemarkEmbedderOptions, Transformer}

/*
eslint
  @typescript-eslint/no-explicit-any: "off",
*/
