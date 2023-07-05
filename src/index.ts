import {type Element, type Root} from 'hast'
import {type Plugin} from 'unified'
import {type Link, type Paragraph, type Text} from 'mdast'

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

type TransformerInfo = {
  url: string
  transformer: Transformer<unknown>
  config: TransformerConfig
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
    info: TransformerInfo,
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
const htmlToHast = async (string: string): Promise<Element> => {
  const {fromParse5} = await import('hast-util-from-parse5')
  const parse5 = await import('parse5')
  return (fromParse5(parse5.parseFragment(string)) as Root)
    .children[0] as Element
}

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
    const {visit} = await import('unist-util-visit')
    const nodeAndURL: Array<{parentNode: Paragraph; url: string}> = []

    visit(tree, 'paragraph', (paragraphNode: Paragraph) => {
      if (paragraphNode.children.length !== 1) {
        return
      }

      const {children} = paragraphNode
      const node = children[0] as Link | Text
      const isText = node.type === 'text'
      // it's a valid link if there's no title, and the value is the same as the URL
      const isValidLink =
        node.type === 'link' &&
        !node.title &&
        node.children.length === 1 &&
        node.children[0].type === 'text' &&
        node.children[0].value === node.url
      if (!(isText || isValidLink)) {
        return
      }

      const value = isText ? node.value : node.url
      const urlString = getUrlString(value)
      if (!urlString) {
        return
      }
      nodeAndURL.push({parentNode: paragraphNode, url: urlString})
    })

    const nodesToTransform: Array<
      typeof nodeAndURL[number] & typeof transformersAndConfig[number]
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

          try {
            if (!html) {
              html = await transformer.getHTML(url, config)
              html = html?.trim() ?? null
              await cache?.set(cacheKey, html)
            }

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

          // if nothing's returned from getHTML, then no modifications are needed
          if (!html) {
            return
          }

          // convert the HTML string into an AST
          const htmlElement = await htmlToHast(html)

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
export type {RemarkEmbedderOptions, Transformer, TransformerInfo}

/*
eslint
  @typescript-eslint/no-explicit-any: "off",
*/
