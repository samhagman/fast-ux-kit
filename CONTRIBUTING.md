# Contributing to Fast UX Kit

## Contribution agreement

Sam Hagman is the steward of Fast UX Kit. By submitting a contribution for
inclusion in this project, you agree to the Blue Oak Contributor License 1.0.0
reproduced below. This grants the steward the rights needed to distribute and
license your contribution, including under the project's public licenses and
separate commercial agreements.

Confirm this agreement in your pull request. For work owned by an employer or
client, obtain the necessary permission before submitting it. Identify any
third-party material and preserve its license and required notices.

## Preparing a change

- Keep changes focused and describe the behavior they add or repair.
- Author custom components and behavior independently. Standard generated
  shadcn/ui primitives must retain their required MIT notices.
- Use synthetic examples and test data. Keep credentials, personal documents and
  application-specific configuration outside the repository.
- Preserve keyboard access, semantic labels, mobile target sizes, RTL behavior,
  reduced motion and stable server rendering.
- Create the fixtures and state needed to exercise the changed behavior.

## Local validation

Run these commands on the exact source snapshot submitted for review.

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run check
npm run test:consumer
```

The root install includes the Studio workspace. For Studio changes, also run
its local checks.

```sh
npm --prefix studio run typecheck
npm --prefix studio test
npm --prefix studio run build
```

Include the command results in the pull request. Describe the browser and
accessibility checks performed for interaction changes. Repository validation
runs locally.

## Pull requests

Start with the situation, complication and resolution so reviewers can follow
why the change is needed. Summarize the implementation, record validation and
complete the contribution-agreement checkbox in the pull request template.

## Blue Oak Contributor License 1.0.0

The following official text is reproduced verbatim.
[Official license](https://blueoakcouncil.org/contributor/1.0.0).

```text
# Blue Oak Contributor License

Version 1.0.0

## Purpose

This license gives the steward of a software project
the legal rights and assurances it needs to accept
contributions covered by intellectual property rights.

## Copyright

The contributor licenses the steward to do everything with
their contributions that would otherwise infringe their
copyrights in them.

## Patent

The contributor licenses the steward to do everything with
their contributions that would otherwise infringe any patent
claims they can license or become able to license.

## Sublicensing

The steward can license the contributions to others in
turn, under whatever terms it chooses.

## Reliability

The contributor cannot revoke this license.

## Termination

The contributor can stop this license from covering
contributions submitted in the future by writing the steward
through one of the channels it uses to receive contributions.
Contributions the contributor submitted before remain under
this license.

## Awareness

The contributor is aware that because of legal rules and
contracts, they may need to get someone else's permission to
submit contributions, even of their own work.  For example,
"work made for hire" rules can make employers and clients
the owners of copyrights in the contributor's work.
Contracts with clients, or to form new companies, may make
them the owners of copyrights in the contributor's work.

## Rights

All work in contributions the contributor submits for
inclusion in the project will be either:

- their own work, which they own the copyrights in or
  have permission to submit

- work licensed by others under permissive license
  terms that Blue Oak Council rates "bronze" or better at
  <https://blueoakcouncil.org/list>

## Notices

The contributor promises to copy copyright notices,
license terms, and other licensing-related notices for
work licensed by others in their contributions, so the
steward can tell what work is licensed by others under
what terms and follow their notice requirements.

## No Liability

***As far as the law allows, contributions under this
license come as is, without any warranty or condition,
except those under "Rights" above.***

***As far as the law allows, the contributor will not be
liable to anyone for any damages related to contributions
under this license, under any kind of legal claim, except
for claims under "Rights" above.***
```
