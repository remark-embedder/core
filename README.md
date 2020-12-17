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
of that link. It's a [remark](https://remark.js.org/) plugin (the de-facto
standard markdown parser). You provide a "transformer" the the plugin does the
rest.

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

```
npm install --save @remark-embedder/core
```

## Usage

Here's the most complete, simplest, practical example I can offer:

```javascript
import remark from 'remark'
import html from 'remark-html'
import remarkEmbedder from '@remark-embedder/core'
// or, if you're using CJS:
// const {default: remarkEmbedder} = require('@remark-embedder/core')

const codesandboxTransformer = {
  name: 'Codesandbox',
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
This is a codesandbox:

https://codesandbox.io/s/css-variables-vs-themeprovider-df90h
`

async function go() {
  const result = await remark()
    .use(remarkEmbedder, {
      transformers: [codesandboxTransformer],
    })
    .use(html)
    .process(exampleMarkdown)

  console.log(result.toString())
  // logs:
  // <p>This is a codesandbox:</p>
  // <iframe src="https://codesandbox.io/embed/css-variables-vs-themeprovider-df90h" style="width:100%; height:500px; border:0; border-radius: 4px; overflow:hidden;" allow="accelerometer; ambient-light-sensor; camera; encrypted-media; geolocation; gyroscope; hid; microphone; midi; payment; usb; vr; xr-spatial-tracking" sandbox="allow-forms allow-modals allow-popups allow-presentation allow-same-origin allow-scripts"></iframe>
}
```

### Options

The `transformers` option is required (otherwise the plugin won't do anything),
but there are a few optional options as well.

#### `transformers: Array<Transformer>`

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

##### `getHTML: (url: string, config: unknown) => string | null | Promise<string | null>`

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

Some services have endpoints that you can use to get the embed HTML
([like twitter for example](https://developer.twitter.com/en/docs/twitter-api/v1/tweets/post-and-engage/api-reference/get-statuses-oembed)).

#### `cache: Map<string, string | null>`

Because some of your transforms may make network requests to retrieve the HTML,
we support providing a `cache`. You could pass `new Map()`, but that would only
be useful during the life of your process (which means it probably wouldn't be
all that helpful). If you want to persist this to the file system (so it works
across compilations), you could use something like
[lowdb](https://github.com/typicode/lowdb).

The cache key is set to `remark-embedder:${transformerName}:${urlString}` and
the value is the resulting HTML.

Also, while technically we treat the cache as a `Map`, all we really care about
is that the cache has a `get` and a `set` and we `await` both of those calls to
support async caches (like gatsby's).

### Configuration

You can provide configuration for your transformer by specifying the transformer
as an array. This may not seem very relevant if you're creating your own custom
transformer where you can simply edit the code directly, but if the transformer
is published to `npm` then allowing users to configure your transformer
externally can be quite useful (especially if your transformer requires an API
token to request the embed information like with
[instagram](https://developers.facebook.com/docs/instagram/oembed/)).

Here's a simple example:

```javascript
const codesandboxTransformer = {
  name: 'Codesandbox',
  shouldTransform(url) {
    // ...
  },
  getHTML(url, config) {
    // ... config(url).height === '600px'
  },
}

const getCodesandboxConfig = url => ({height: '600px'})

const result = await remark()
  .use(remarkEmbedder, {
    transformers: [
      someUnconfiguredTransformer, // remember, not all transforms need/accept configuration
      [codesandboxTransformer, getCodesandboxConfig],
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

```javascript
const codesandboxTransformer = {
  name: 'Codesandbox',
  shouldTransform(url) {
    // ...
  },
  // default config function returns what it's given
  getHTML(url, config = html => html) {
    const html = '... embed html here ...'
    return config({url, html})
  },
}

const getCodesandboxConfig = ({url, html}) => {
  if (hasSomeSpecialQueryParam(url)) {
    return modifyHTMLBasedOnQueryParam(html)
  }
  return html
}

const result = await remark()
  .use(remarkEmbedder, {
    transformers: [
      someUnconfiguredTransformer, // remember, not all transforms need/accept configuration
      [codesandboxTransformer, getCodesandboxConfig],
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

```typescript
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

```typescript
// ...
import type {Config as CodesandboxConfig} from '@remark-embedder/transformer-codesandbox'
import transformer from '@remark-embedder/transformer-codesandbox'

// ...

remark().use(remarkEmbedder, {
  transformers: [codesandboxTransformer, config as CodesandboxConfig],
})
// ...
```

## Inspiration

This whole plugin was extracted out of
[Kent C. Dodds' Gatsby website](https://github.com/kentcdodds/kentcdodds.com/blob/f114842e40b22d38b726f0a7fdaf8c21937eb2cc/plugins/remark-embedder/index.js)
into `gatsby-remark-embedder` by
[Michaël De Boey](https://github.com/MichaelDeBoey) and then Kent extracted the
remark plugin into this core package.

## Other Solutions

- [MDX Embed](https://www.mdx-embed.com): Allows you to use components in MDX
  files for common services. A pretty different approach to solving a similar
  problem.

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
  <tr>
    <td align="center"><a href="https://kentcdodds.com"><img src="https://avatars.githubusercontent.com/u/1500684?v=3" width="100px;" alt="Kent C. Dodds"/><br /><sub><b>Kent C. Dodds</b></sub></a><br /><a href="https://github.com/remark-embedder/core/commits?author=kentcdodds" title="Code">💻</a> <a href="https://github.com/remark-embedder/core/commits?author=kentcdodds" title="Documentation">📖</a> <a href="#infra-kentcdodds" title="Infrastructure (Hosting, Build-Tools, etc)">🚇</a> <a href="https://github.com/remark-embedder/core/commits?author=kentcdodds" title="Tests">⚠️</a></td>
    <td align="center"><a href="https://michaeldeboey.be"><img src="https://avatars3.githubusercontent.com/u/6643991?v=4" width="100px;" alt=""/><br /><sub><b>Michaël De Boey</b></sub></a><br /><a href="https://github.com/MichaelDeBoey/gatsby-remark-embedder/issues?q=author%3AMichaelDeBoey" title="Bug reports">🐛</a> <a href="https://github.com/MichaelDeBoey/gatsby-remark-embedder/commits?author=MichaelDeBoey" title="Code">💻</a> <a href="https://github.com/MichaelDeBoey/gatsby-remark-embedder/commits?author=MichaelDeBoey" title="Documentation">📖</a> <a href="https://github.com/MichaelDeBoey/gatsby-remark-embedder/commits?author=MichaelDeBoey" title="Tests">⚠️</a></td>
  </tr>
</table>

<!-- markdownlint-enable -->
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
<!-- prettier-ignore-end -->
