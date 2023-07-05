<div align="center">
<h1>@remark-embedder/core 🔗</h1>

<p>Remark plugin to convert URLs to embed code in markdown.</p>
</div>

---

<!-- prettier-ignore-start -->
[![Build Status][build-badge]][build]
[![Code Coverage][coverage-badge]][coverage]
[![version][version-badge]][package]
[![downloads][downloads-badge]][npmtrends]
[![MIT License][license-badge]][license]
[![All Contributors][all-contributors-badge]](#contributors-)
[![PRs Welcome][prs-badge]][prs]
[![Code of Conduct][coc-badge]][coc]
<!-- prettier-ignore-end -->

## The problem

I used to write blog posts on Medium. When I moved on to my own site, I started
writing my blog posts in markdown and I missed the ability to just copy a URL
(like for a tweet), paste it in the blog post, and have Medium auto-embed it for
me.

## This solution

This allows you to transform a link in your markdown into the embedded version
of that link. It's a [remark][remark] plugin (the de-facto standard markdown
parser). You provide a "transformer" the plugin does the rest.

## Table of Contents

<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->

- [Installation](#installation)
- [Usage](#usage)
  - [Options](#options)
  - [Configuration](#configuration)
- [Making a transformer module](#making-a-transformer-module)
- [Inspiration](#inspiration)
- [Other Solutions](#other-solutions)
- [Issues](#issues)
  - [🐛 Bugs](#-bugs)
  - [💡 Feature Requests](#-feature-requests)
- [Contributors ✨](#contributors-)
- [LICENSE](#license)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->

## Installation

This module is distributed via [npm][npm] which is bundled with [node][node] and
should be installed as one of your project's `dependencies`:

```shell
npm install @remark-embedder/core
```

## Usage

Here's the most complete, simplest, practical example I can offer:

```js
import remarkEmbedder from '@remark-embedder/core'
// or, if you're using CJS:
// const {default: remarkEmbedder} = require('@remark-embedder/core')
import remark from 'remark'
import html from 'remark-html'

const CodeSandboxTransformer = {
  name: 'CodeSandbox',
  // shouldTransform can also be async
  shouldTransform(url) {
    const {host, pathname} = new URL(url)

    return (
      ['codesandbox.io', 'www.codesandbox.io'].includes(host) &&
      pathname.includes('/s/')
    )
  },
  // getHTML can also be async
  getHTML(url) {
    const iframeUrl = url.replace('/s/', '/embed/')

    return `<iframe src="${iframeUrl}" style="width:100%; height:500px; border:0; border-radius: 4px; overflow:hidden;" allow="accelerometer; ambient-light-sensor; camera; encrypted-media; geolocation; gyroscope; hid; microphone; midi; payment; usb; vr; xr-spatial-tracking" sandbox="allow-forms allow-modals allow-popups allow-presentation allow-same-origin allow-scripts"></iframe>`
  },
}

const exampleMarkdown = `
This is a CodeSandbox:

https://codesandbox.io/s/css-variables-vs-themeprovider-df90h
`

async function go() {
  const result = await remark()
    .use(remarkEmbedder, {
      transformers: [CodeSandboxTransformer],
    })
    .use(html)
    .process(exampleMarkdown)

  console.log(result.toString())
  // logs:
  // <p>This is a CodeSandbox:</p>
  // <iframe src="https://codesandbox.io/embed/css-variables-vs-themeprovider-df90h" style="width:100%; height:500px; border:0; border-radius: 4px; overflow:hidden;" allow="accelerometer; ambient-light-sensor; camera; encrypted-media; geolocation; gyroscope; hid; microphone; midi; payment; usb; vr; xr-spatial-tracking" sandbox="allow-forms allow-modals allow-popups allow-presentation allow-same-origin allow-scripts"></iframe>
}

go()
```

### Options

The `transformers` option is required (otherwise the plugin won't do anything),
but there are a few optional options as well.

#### `transformers: Array<Transformer | [Transformer, unknown]>`

**Take a look at
[`@remark-embedder/transformer-oembed`][@remark-embedder/transformer-oembed]**
which should cover you for most things you'll want to convert to embeds.

The transformer objects are where you convert a link to it's HTML embed
representation.

##### `name: string`

This is the name of your transformer. It's required because it's used in error
messages. I suggest you use your module name if you're publishing this
transformer as a package so people know where to open issues if there's a
problem.

##### `shouldTransform: (url: string) => boolean | Promise<boolean>`

Only URLs on their own line will be transformed, but for your transformer to be
called, you must first determine whether a given URL should be transformed by
your transformer. The `shouldTransform` function accepts the URL string and
returns a boolean. `true` if you want to transform, and `false` if not.

Typically this will involve checking whether the URL has all the requisite
information for the transformation (it's the right host and has the right query
params etc.).

You might also consider doing some basic checking, for example, if it looks a
lot like the kind of URL that you would handle, but is missing important
information and you're confident that's a mistake, you could log helpful
information using `console.log`.

##### `getHTML: (url: string, config?: unknown) => string | null | Promise<string | null>`

The `getHTML` function accepts the `url` string and a config option (learn more
from the `services` option). It returns a string of HTML or a promise that
resolves to that HTML. This HTML will be used to replace the link.

It's important that the HTML you return only has a single root element.

```js
// This is ok ✅
return `<iframe src="..."></iframe>`

// This is not ok ❌
return `<blockquote>...</blockquote><a href="...">...</a>`

// But this would be ok ✅
return `<div><blockquote>...</blockquote><a href="...">...</a></div>`
```

Some services have endpoints that you can use to get the embed HTML ([like
twitter for example][twitter-oembed-docs]).

#### `handleHTML?: (html: GottenHTML, info: TransformerInfo) => GottenHTML | Promise<GottenHTML>`

Add optional HTML around what is returned by the transformer. This is useful for
surrounding the returned HTML with custom HTML and classes.

Here's a quick example of an HTML handler that would handle adding
[TailwindCSS aspect ratio](https://github.com/tailwindlabs/tailwindcss-aspect-ratio)
classes to YouTube videos:

```typescript
import remark from 'remark'
import remarkEmbedder, {TransformerInfo} from '@remark-embedder/core'
import oembedTransformer from '@remark-embedder/transformer-oembed'
import remarkHtml from 'remark-html'

const exampleMarkdown = `
Check out this video:

https://www.youtube.com/watch?v=dQw4w9WgXcQ
`

function handleHTML(html: string, info: TransformerInfo) {
  const {url, transformer} = info
  if (
    transformer.name === '@remark-embedder/transformer-oembed' ||
    url.includes('youtube.com')
  ) {
    return `<div class="embed-youtube aspect-w-16 aspect-h-9">${html}</div>`
  }
  return html
}

const result = await remark()
  .use(remarkEmbedder, {
    transformers: [oembedTransformer],
    handleHTML,
  })
  .use(remarkHtml)
  .process(exampleMarkdown)

// This should return:
// <p>Check out this video:</p>
// <div class="embedded-youtube aspect-w-16 aspect-h-9"><iframe width="200" height="113" src="https://www.youtube.com/embed/dQw4w9WgXcQ?feature=oembed" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen=""></iframe></div>
```

#### `handleError?: (errorInfo: ErrorInfo) => GottenHTML | Promise<GottenHTML>`

```ts
type ErrorInfo = {
  error: Error
  url: string
  transformer: Transformer<unknown>
  config: TransformerConfig
}
```

If remark-embedder encounters an error with any transformer, then compilation
will fail. I've found this to be problematic when using
[`@remark-embedder/transformer-oembed`][@remark-embedder/transformer-oembed] for
tweets and the tweet author deletes their tweet. It'll prevent you from building
and that's annoying.

So `handleError` allows you to handle any error that's thrown by a transformer.
This way you can gracefully fallback to something rather than crashing
everything. Even if you provide a `handleError`, we'll log to the console so you
can fix the problem in the future.

Here's a quick example of an error handler that would handle deleted tweets:

```typescript
function handleError({error, url, transformer}) {
  if (
    transformer.name !== '@remark-embedder/transformer-oembed' ||
    !url.includes('twitter.com')
  ) {
    // we're only handling errors from this specific transformer and the twitter URL
    // so we'll rethrow errors from any other transformer/url
    throw error
  }
  return `<p>Unable to embed <a href="${url}">this tweet</a>.</p>`
}

const result = await remark()
  .use(remarkEmbedder, {
    transformers: [oembedTransformer],
    handleError,
  })
  .use(html)
  .process(exampleMarkdown)
```

You'll get an error logged, but it won't break your build. It also won't be
cached (if you're using the `cache` option).

#### `cache?: Map<string, string | null>`

**You'll mostly likely want to use
[`@remark-embedder/cache`][@remark-embedder/cache]**

Because some of your transforms may make network requests to retrieve the HTML,
we support providing a `cache`. You could pass `new Map()`, but that would only
be useful during the life of your process (which means it probably wouldn't be
all that helpful). You'll want to make sure to persist this to the file system
(so it works across compilations), which is why you should probably use
[`@remark-embedder/cache`][@remark-embedder/cache].

The cache key is set to `remark-embedder:${transformerName}:${urlString}` and
the value is the resulting HTML.

Also, while technically we treat the cache as a `Map`, all we really care about
is that the cache has a `get` and a `set` and we `await` both of those calls to
support async caches (like [`@remark-embedder/cache`][@remark-embedder/cache] or
[Gatsby's built-in plugin cache][gatsby-plugin-cache-source]).

### Configuration

You can provide configuration for your transformer by specifying the transformer
as an array. This may not seem very relevant if you're creating your own custom
transformer where you can simply edit the code directly, but if the transformer
is published to `npm` then allowing users to configure your transformer
externally can be quite useful (especially if your transformer requires an API
token to request the embed information like with
[instagram][instagram-oembed-docs]).

Here's a simple example:

```js
const CodeSandboxTransformer = {
  name: 'CodeSandbox',
  shouldTransform(url) {
    // ...
  },
  getHTML(url, config) {
    // ...
  },
}

const getCodeSandboxConfig = url => ({height: '600px'})

const result = await remark()
  .use(remarkEmbedder, {
    transformers: [
      someUnconfiguredTransformer, // remember, not all transforms need/accept configuration
      [codesandboxTransformer, getCodeSandboxConfig],
    ],
  })
  .use(html)
  .process(exampleMarkdown)
```

The `config` is typed as `unknown` so transformer authors have the liberty to
set it as anything they like. The example above uses a function, but you could
easily only offer an object. Personally, I think using the function gives the
most flexibility for folks to configure the transform. In fact, I think a good
pattern could be something like the following:

```js
const CodeSandboxTransformer = {
  name: 'CodeSandbox',
  shouldTransform(url) {
    // ...
  },
  // default config function returns what it's given
  getHTML(url, config = html => html) {
    const html = '... embed html here ...'
    return config({url, html})
  },
}

const getCodeSandboxConfig = ({url, html}) =>
  hasSomeSpecialQueryParam(url) ? modifyHTMLBasedOnQueryParam(html) : html

const result = await remark()
  .use(remarkEmbedder, {
    transformers: [
      someUnconfiguredTransformer, // remember, not all transforms need/accept configuration
      [CodeSandboxTransformer, getCodeSandboxConfig],
    ],
  })
  .use(html)
  .process(exampleMarkdown)
```

This pattern inverts control for folks who like what your transform does, but
want to modify it slightly. If written like above (`return config(...)`) it
could even allow the config function to be `async`.

## Making a transformer module

Here's what our simple example would look like as a transformer module:

```ts
import type {Transformer} from '@remark-embedder/core'

type Config = (url: string) => {height: string}
const getDefaultConfig = () => ({some: 'defaultConfig'})

const transformer: Transformer<Config> = {
  // this should be the name of your module:
  name: '@remark-embedder/transformer-codesandbox',
  shouldTransform(url) {
    // do your thing and return true/false
    return false
  },
  getHTML(url, getConfig = getDefaultConfig) {
    // get the config...
    const config = getConfig(url)
    // do your thing and return the HTML
    return '<iframe>...</iframe>'
  },
}

export default transformer
export type {Config}
```

If you're not using TypeScript, simply remove the `type` import and the
`: Transformer` bit.

If you're using CommonJS, then you'd also swap `export default transformer` for
`module.exports = transformer`

NOTE: If you're using `export default` then CommonJS consumers will need to add
a `.default` to get your transformer with `require`.

To take advantage of the config type you export, the user of your transform
would need to cast their config when running it through remark. For example:

```ts
// ...
import transformer from '@remark-embedder/transformer-codesandbox'
import type {Config as CodesandboxConfig} from '@remark-embedder/transformer-codesandbox'

// ...

remark().use(remarkEmbedder, {
  transformers: [codesandboxTransformer, config as CodesandboxConfig],
})
// ...
```

## Inspiration

This whole plugin was extracted out of [Kent C. Dodds' Gatsby
website][kentcdodds.com-remark-embedder-plugin] into
[`gatsby-remark-embedder`][gatsby-remark-embedder] by [Michaël De
Boey][michaeldeboey] and then [Kent][kentcdodds] extracted the remark plugin
into this core package.

## Other Solutions

- [MDX Embed][mdx-embed]: Allows you to use components in MDX files for common
  services. A pretty different approach to solving a similar problem.

## Issues

_Looking to contribute? Look for the [Good First Issue][good-first-issue]
label._

### 🐛 Bugs

Please file an issue for bugs, missing documentation, or unexpected behavior.

[**See Bugs**][bugs]

### 💡 Feature Requests

Please file an issue to suggest new features. Vote on feature requests by adding
a 👍. This helps maintainers prioritize what to work on.

[**See Feature Requests**][requests]

## Contributors ✨

Thanks goes to these people ([emoji key][emojis]):

<!-- ALL-CONTRIBUTORS-LIST:START - Do not remove or modify this section -->
<!-- prettier-ignore-start -->
<!-- markdownlint-disable -->
<table>
  <tbody>
    <tr>
      <td align="center" valign="top" width="14.28%"><a href="https://kentcdodds.com"><img src="https://avatars.githubusercontent.com/u/1500684?v=3?s=100" width="100px;" alt="Kent C. Dodds"/><br /><sub><b>Kent C. Dodds</b></sub></a><br /><a href="https://github.com/remark-embedder/core/commits?author=kentcdodds" title="Code">💻</a> <a href="https://github.com/remark-embedder/core/commits?author=kentcdodds" title="Documentation">📖</a> <a href="#infra-kentcdodds" title="Infrastructure (Hosting, Build-Tools, etc)">🚇</a> <a href="https://github.com/remark-embedder/core/commits?author=kentcdodds" title="Tests">⚠️</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://michaeldeboey.be"><img src="https://avatars3.githubusercontent.com/u/6643991?v=4?s=100" width="100px;" alt="Michaël De Boey"/><br /><sub><b>Michaël De Boey</b></sub></a><br /><a href="https://github.com/remark-embedder/core/issues?q=author%3AMichaelDeBoey" title="Bug reports">🐛</a> <a href="https://github.com/remark-embedder/core/commits?author=MichaelDeBoey" title="Code">💻</a> <a href="https://github.com/remark-embedder/core/commits?author=MichaelDeBoey" title="Documentation">📖</a> <a href="https://github.com/remark-embedder/core/commits?author=MichaelDeBoey" title="Tests">⚠️</a> <a href="https://github.com/remark-embedder/core/pulls?q=is%3Apr+reviewed-by%3AMichaelDeBoey" title="Reviewed Pull Requests">👀</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/johnstonmatt"><img src="https://avatars1.githubusercontent.com/u/5455542?v=4?s=100" width="100px;" alt="Matt Johnston"/><br /><sub><b>Matt Johnston</b></sub></a><br /><a href="https://github.com/remark-embedder/core/commits?author=johnstonmatt" title="Documentation">📖</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://www.osiux.ws/"><img src="https://avatars2.githubusercontent.com/u/204463?v=4?s=100" width="100px;" alt="Eduardo Reveles"/><br /><sub><b>Eduardo Reveles</b></sub></a><br /><a href="https://github.com/remark-embedder/core/commits?author=osiux" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="http://wooorm.com"><img src="https://avatars0.githubusercontent.com/u/944406?v=4?s=100" width="100px;" alt="Titus"/><br /><sub><b>Titus</b></sub></a><br /><a href="https://github.com/remark-embedder/core/pulls?q=is%3Apr+reviewed-by%3Awooorm" title="Reviewed Pull Requests">👀</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://bradgarropy.com"><img src="https://avatars2.githubusercontent.com/u/11336745?v=4?s=100" width="100px;" alt="Brad Garropy"/><br /><sub><b>Brad Garropy</b></sub></a><br /><a href="https://github.com/remark-embedder/core/commits?author=bradgarropy" title="Code">💻</a> <a href="https://github.com/remark-embedder/core/issues?q=author%3Abradgarropy" title="Bug reports">🐛</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/mikestecker"><img src="https://avatars.githubusercontent.com/u/407465?v=4?s=100" width="100px;" alt="Mike Stecker"/><br /><sub><b>Mike Stecker</b></sub></a><br /><a href="https://github.com/remark-embedder/core/commits?author=mikestecker" title="Code">💻</a> <a href="https://github.com/remark-embedder/core/commits?author=mikestecker" title="Tests">⚠️</a> <a href="https://github.com/remark-embedder/core/commits?author=mikestecker" title="Documentation">📖</a></td>
    </tr>
    <tr>
      <td align="center" valign="top" width="14.28%"><a href="https://blog.mono0x.net/"><img src="https://avatars.githubusercontent.com/u/231380?v=4?s=100" width="100px;" alt="mono"/><br /><sub><b>mono</b></sub></a><br /><a href="https://github.com/remark-embedder/core/commits?author=mono0x" title="Code">💻</a> <a href="https://github.com/remark-embedder/core/commits?author=mono0x" title="Tests">⚠️</a></td>
    </tr>
  </tbody>
</table>

<!-- markdownlint-restore -->
<!-- prettier-ignore-end -->

<!-- ALL-CONTRIBUTORS-LIST:END -->

This project follows the [all-contributors][all-contributors] specification.
Contributions of any kind welcome!

## LICENSE

MIT

<!-- prettier-ignore-start -->
[npm]: https://www.npmjs.com
[node]: https://nodejs.org
[build-badge]: https://img.shields.io/github/workflow/status/remark-embedder/core/validate?logo=github&style=flat-square
[build]: https://github.com/remark-embedder/core/actions?query=workflow%3Avalidate
[coverage-badge]: https://img.shields.io/codecov/c/github/remark-embedder/core.svg?style=flat-square
[coverage]: https://codecov.io/github/remark-embedder/core
[version-badge]: https://img.shields.io/npm/v/@remark-embedder/core.svg?style=flat-square
[package]: https://www.npmjs.com/package/@remark-embedder/core
[downloads-badge]: https://img.shields.io/npm/dm/@remark-embedder/core.svg?style=flat-square
[npmtrends]: https://www.npmtrends.com/@remark-embedder/core
[license-badge]: https://img.shields.io/npm/l/@remark-embedder/core.svg?style=flat-square
[license]: https://github.com/remark-embedder/core/blob/main/LICENSE
[prs-badge]: https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square
[prs]: https://makeapullrequest.com
[coc-badge]: https://img.shields.io/badge/code%20of-conduct-ff69b4.svg?style=flat-square
[coc]: https://github.com/remark-embedder/core/blob/main/CODE_OF_CONDUCT.md
[emojis]: https://github.com/all-contributors/all-contributors#emoji-key
[all-contributors]: https://github.com/all-contributors/all-contributors
[all-contributors-badge]: https://img.shields.io/github/all-contributors/remark-embedder/core?color=orange&style=flat-square
[bugs]: https://github.com/remark-embedder/core/issues?utf8=%E2%9C%93&q=is%3Aissue+is%3Aopen+sort%3Acreated-desc+label%3Abug
[requests]: https://github.com/remark-embedder/core/issues?utf8=%E2%9C%93&q=is%3Aissue+is%3Aopen+sort%3Areactions-%2B1-desc+label%3Aenhancement
[good-first-issue]: https://github.com/remark-embedder/core/issues?utf8=%E2%9C%93&q=is%3Aissue+is%3Aopen+sort%3Areactions-%2B1-desc+label%3Aenhancement+label%3A%22good+first+issue%22

[@remark-embedder/cache]: https://github.com/remark-embedder/cache
[@remark-embedder/transformer-oembed]: https://github.com/remark-embedder/transformer-oembed
[gatsby-plugin-cache-source]: https://github.com/gatsbyjs/gatsby/blob/0a06a795c434312150f30048567b0e2cd797027e/packages/gatsby/src/utils/cache.ts
[gatsby-remark-embedder]: https://github.com/MichaelDeBoey/gatsby-remark-embedder
[instagram-oembed-docs]: https://developers.facebook.com/docs/instagram/oembed
[kentcdodds]: https://github.com/KentCDodds
[kentcdodds.com-remark-embedder-plugin]: https://github.com/kentcdodds/kentcdodds.com/blob/f114842e40b22d38b726f0a7fdaf8c21937eb2cc/plugins/remark-embedder/index.js
[mdx-embed]: https://mdx-embed.com
[michaeldeboey]: https://github.com/MichaelDeBoey
[remark]: https://remark.js.org
[twitter-oembed-docs]: https://developer.twitter.com/en/docs/twitter-api/v1/tweets/post-and-engage/api-reference/get-statuses-oembed
<!-- prettier-ignore-end -->
