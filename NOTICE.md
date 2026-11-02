# Implementation and license status

Implementation in `src/` is independently authored for fast-ux-kit. No external
implementation source, assets or test suites are copied or vendored. Behaviors
are implemented against an independently documented functional contract.

Dependencies are consumed as packages, not vendored source:

- React and React DOM: MIT.
- React Aria Components 1.22.1: Apache-2.0.
- Ark UI React 5.39.3: MIT.

The root package is deliberately `private: true` and `license: UNLICENSED` pending
owner approval of a public license. No public-use rights are granted by this
repository for newly authored code yet. Third-party licenses remain applicable to
their respective packages. Any future copying requires preserving all mandatory
notices and recording legally required source information. This is an implementation notice,
not a legal opinion.

Additional content rendering packages:

- react-markdown 10.1.0: MIT.
- remark-gfm 4.0.1: MIT.

Studio editing and Markdown packages (consumed as packages by `studio/`):

- prosemirror-model, prosemirror-state, prosemirror-view, prosemirror-transform,
  prosemirror-commands and prosemirror-keymap: MIT.
- micromark 4 and micromark-extension-gfm-strikethrough 2: MIT.
- Their dependencies (orderedmap, w3c-keyname, the micromark-util and
  micromark-factory packages, decode-named-character-reference, devlop, debug, ms):
  MIT.
