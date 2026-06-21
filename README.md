# 📘 template

[https://kyaulabs.com/](https://kyaulabs.com/)

[![Contributor Covenant](https://img.shields.io/badge/contributor%20covenant-2.1-4baaaa.svg?logo=open-source-initiative&logoColor=4baaaa)](CODE_OF_CONDUCT.md) &nbsp; [![Conventional Commits](https://img.shields.io/badge/conventional%20commits-1.0.0-fe5196?style=flat&logo=conventionalcommits)](https://www.conventionalcommits.org/en/v1.0.0/) &nbsp; [![GitHub](https://img.shields.io/github/license/kyaulabs/template?logo=creativecommons)](LICENSE) &nbsp; [![Gitleaks](https://img.shields.io/badge/protected%20by-gitleaks-blue?logo=git&logoColor=seagreen&color=seagreen)](https://github.com/zricethezav/gitleaks)  
[![Semantic Versioning](https://img.shields.io/github/v/release/kyaulabs/template?include_prereleases&logo=semver&sort=semver)](https://semver.org) &nbsp; [![Discord](https://img.shields.io/discord/88713030895943680?logo=discord&color=blue&logoColor=white)](https://discord.gg/DSvUNYm)

## About

This repository is the basis for all other repositories created here at KYAU Labs.

* GitHub limits repositories to 10GB of cache space for actions.
* GitHub limits users/organizations to 0.5GB of artifact storage.

Keep these factors in mind when setting up repositories.

* [About](#about)
* [Install Additions (optional)](#install-additions-optional)
  * [PHP](#php)
* [New Repository](#new-repository)
  * [Clone this Template](#clone)
  * [Initialize Repository](#init)
  * [Add License](#add-license)
  * [Add `.gitignore`](#add-gitignore)
  * [Update `README.md`](#update-readmemd)
* [Git Hooks](#git-hooks)
  * [Configuration](#configuration)
  * [Symlinks](#symlinks)
* [Initial Commit](#initial-commit)
  * [Stage All](#stage-all)
  * [Commit](#commit)
  * [Push](#push)
* [Repository Settings](#repository-settings)
  * [General](#general)
  * [Collaborators and Teams](#collaborators-and-teams)
  * [Branches](#branches)
  * [Webhooks](#webhooks)
* [Issue Labels](#issue-labels)
* [Conventional Commits](#conventional-commits)
  * [Type](#type)
  * [Scope](#scope)
  * [Subject](#subject)
  * [Body](#body)
  * [Footer](#footer)
  * [Examples](#examples)
* [Changelog](#changelog)
* [Unity Projects](#unity-projects)
  * [Unity Activation](#unity-activation)
* [Attribution](#attribution)

## Install Additions (optional)

```sh
🚧 WARNING
# This is only required if you do not already have commitlint and git-cliff installed.
```

Install `commitlint` and `git-cliff` globally and then generate a commitlint config file.

```text
npm i -g @commitlint/config-conventional @commitlint/cli git-cliff
```

### PHP

For PHP-based projects install the following:

**Globally:**
- `php-cs-fixer` — download from [cs.symfony.com](https://cs.symfony.com/)

**Project devDependencies (requires npm):**
```text
npm install --save-dev stylelint stylelint-config-standard-scss eslint @eslint/js
```

## New Repository

Base the repository off of the organization template repository.

### Clone

```text
git clone https://github.com/kyaulabs/template <REPOSITORY_NAME>
cd <REPOSITORY_NAME>
rm -rf .git
```

### Init

Initialize your new repository.

```text
git init
```

### Add `LICENSE`

Add in a `LICENSE` of choice, using the filename `LICENSE.txt`, `LICENSE.md` or `LICENSE.rst`. There are two main repositories of licenses to choose from:

* GNU: [GNU APGLv3](https://choosealicense.com/licenses/agpl-3.0/) / [GNU GPLv3](https://choosealicense.com/licenses/gpl-3.0/) / [GNU LGPLv3](https://choosealicense.com/licenses/lgpl-3.0/)
* General: [Apache License 2.0](https://choosealicense.com/licenses/apache-2.0/) / [MIT License](https://choosealicense.com/licenses/mit/) / [Mozilla Public License 2.0](https://choosealicense.com/licenses/mpl-2.0/)
* CC: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) / [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) / [CC BY-ND 4.0](https://creativecommons.org/licenses/by-nd/4.0) / [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0) / [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0) / [CC BY-NC-ND 4.0](https://creativecommons.org/licenses/by-nc-nd/4.0)

### Add `.gitignore`

Add a  `.gitignore` template from [@github/gitignore](https://github.com/github/gitignore) (modification required).

### Update `README.md`

Take this time to update the `README.md` with at least basic repository information and a hopeful table of contents. It is okay if most sections are blank.

### Update `cliff.toml`

Be sure to modify `cliff.toml` and replace all the instances of `kyaulabs/template` with the new repository location.

### Add Actions

Make sure you add the appropriate actions from the [@kyaulabs/template-workflows](https://github.com/kyaulabs/template-workflows) repository.

Edit the workflow accordingly as all workflows come with only manual activation set with automatic activation commented out.

```yaml
on:
  workflow_dispatch: {}
#on:
#  push:
#    branches: [ "main", "develop" ]
#  workflow_dispatch:
```

## Git Hooks

### Configuration

Generate a config for commitlint.

```c
echo "module.exports = { extends: ['@commitlint/config-conventional'] };" > commitlint.config.js
```

### Symlinks

Copy or symlink to the hooks located inside of `.github/hooks`.

```text
chmod u+x .github/hook/*
cp .github/hooks/* .git/hooks/
```

## Initial Commit

### Stage All

Add all files to the repository. The first command utilizing the dry-run switch to make sure you do not need any last minute additions to `.gitignore`.

```text
git add -A -n
git add -A
```

### Commit

Push the initial commit with (non-commitlint verified message).

```text
git commit -S -a -m "ignore: here be dragons"
```

Finally set the main branch name.

```text
git branch -M main
```

### Push

Add the remote origin and push the branch to origin.

```text
git remote add origin git@github.com:kyaulabs/<REPOSITORY_NAME>.git
git push -u origin main
```

## Repository Settings

In order to have proper repository security, some settings need to change. Open up the repository settings by clicking on the `Settings` tab at the top of the repository.

### General

Upload an image to customize the repository’s social media preview.

* Image should be 1280×640px - [Download template](https://github.com/kyaulabs/win11tweak/settings/og-template)

Under the `Features` section enable `Sponsorships` and then disable anything that is not being using.

### Collaborators and Teams

Under manage access click on `Add people`. In the search box enter and select `@kyaulabs-bot` then change the role to `Write`.

<img src="https://avatars.githubusercontent.com/u/135310113?s=42&v=4" style="vertical-align:middle;margin-left:4ch" /> @kyaulabs-bot

### Branches

Create a new branch protection rule by clicking `Add branch protection rule`.

* Branch name pattern: `main`
* Protect matching branches:
  * `Require a pull request before merging`
  * `Require approvals (1)`
  * `Require signed commits`

Click `Create`.

Create another branch protection rule with the following:

* Branch name pattern: `**/**`
* Protect matching branches:
  * `Require signed commits`

### Webhooks

If you would like this repository to output to a channel on Discord you will need to create a webhook on both ends.

In Discord goto the `Server Settings > Apps > Integrations` and click `New Webhook`. Give it an avatar, name and select a channel for it to output to.

Back on GitHub on the `Settings > Webhooks` page, create a new hook by clicking `Add webhook`.

* Payload URL: Click on `Copy Webhook URL` in Discord to get this URL.
* Content type: `application/json`
* Let me select individual events:
  * `Commit comments` `Forks` `Issues` `Page builds` `Pull requests` `Pushes` `Releases` `Statuses` `Wiki`

Click on `Add webhook`.

## Issue Labels

Organization level issue labels work in conjunction with conventional commits. We use a modified version of the [TIPS](https://www.fat.codes/articles/tips-issue-labeling-system/) system called TPS or Type, Priority and Status as a way to label issues such that they can be organized and assigned accordingly.

In order to properly label something be sure to include at least one type, a single priority and it's current status. Optional labels may be added at your discretion.

**T - Type:** Directly corresponds to the conventional commits [type](#type).
Group | Label | Color | Description
:----:|:-----:|:-----:|-------------
Type | `feature` | <span style="color:#41d6c3">#41d6c3</span> | 🚀 Feature
Type | `patch` | <span style="color:#41d6c3">#41d6c3</span> | 🚀 Sub-Feature
Type | `bug` | <span style="color:#ff5050">#ff5050</span> | 🐛 Bug
Type | `documentation` | <span style="color:#c0e6ff">#c0e6ff</span> | 📝 Documentation
Type | `performance` | <span style="color:#41d6c3">#41d6c3</span> | ⚡️ Performance
Type | `refactor` | <span style="color:#ffa572">#ffa572</span> | ♻️ Refactor
Type | `style` | <span style="color:#ffa572">#ffa572</span> | 💄 Styling
Type | `test` | <span style="color:#ffd791">#ffd791</span> | ⚗️ Testing
Type | `ci/cd` | <span style="color:#ffd791">#ffd791</span> | 👷 CI/CD
Type | `chore` | <span style="color:#ffd791">#ffd791</span> | 🔮 Misc
Type | `security` | <span style="color:#ff5050">#ff5050</span> | 🔒️ Security

**P - Priority:** The urgency of the issue/task.
Group | Label | Color | Description
:----:|:-----:|:-----:|-------------
Priority | `critical` | <span style="color:#800000">#800000</span> | Security-related/Project-breaking
Priority | `high` | <span style="color:#c11c00">#c11c00</span> | Foundational / Important
Priority | `medium` | <span style="color:#f39a4d">#f39a4d</span> | Basic / Normal
Priority | `low` | <span style="color:#8cd211">#8cd211</span> | Additional / Polish

**S - Status:** Current progress.
Group | Label | Color | Description
:----:|:-----:|:-----:|-------------
Status | `done` | <span style="color:#0e8a16">#0e8a16</span> | Complete
Status | `in progress` | <span style="color:#fbca04">#fbca04</span> | Currently Working On
Status | `testing` | <span style="color:#fbca04">#fbca04</span> | Testing Ideas / Methods
Status | `under construction` | <span style="color:#fbca04">#fbca04</span> | Beginning Stages

**Optional:** Two other groups are included for convinience.
Group | Label | Color | Description
:----:|:-----:|:-----:|-------------
Feedback | `brainstorming` | <span style="color:#db2780">#db2780</span> | Coming Up w/ New &lt;Type&gt;
Feedback | `help wanted` | <span style="color:#db2780">#db2780</span> | Help Requested on &lt;Type&gt;
Feedback | `research` | <span style="color:#db2780">#db2780</span> | &lt;Type&gt; Needs Research
Feedback | `request for comments` | <span style="color:#db2780">#db2780</span> | External Opinions Needed on &lt;Type&gt;
Other | `good first issue` | <span style="color:#4e3cb2">#4e3cb2</span> | Good Issue for First Time Contributor
Other | `duplicate` | <span style="color:#cfd3d7">#cfd3d7</span> | Duplicate &lt;Type&gt;
Other | `invalid` | <span style="color:#cfd3d7">#cfd3d7</span> | Invalid &lt;Type&gt;
Other | `on hold` | <span style="color:#cfd3d7">#cfd3d7</span> | Currently On Hold
Other | `won't fix` | <span style="color:#cfd3d7">#cfd3d7</span> | This Will Not Be Fixed

## Conventional Commits

In order to abide by the conventional commit guidelines and in return get auto-generated changelogs, use the following.

```text
<type>[optional scope]: <subject>

[optional body]

[optional footer(s)]
```

### Type

```text
[required] (!empty) value = {
  'build',
  'chore',
  'ci',
  'docs',
  'feat',   # this correlates with MINOR in Semantic Versioning
  'fix',    # this correlates with PATCH in Semantic Versioning
  'patch',  # this correlates with PATCH in Semantic Versioning
  'perf',
  'refactor',
  'revert',
  'style',
  'test',
  'ignore'  # this correlates with CHANGELOG ignores
}

A trailing ! indicates a BREAKING CHANGE (correlating with MAJOR in Semantic Versioning).
```

### Scope

```text
[optional] {lowercase | camelCase}

A noun describing a section of the codebase surrounded by parenthesis.
```

### Subject

```text
[required] (!empty) {lowercase | camelCase} (max-length: 100)

A short summary of the code changes, without a trailing full-stop.

Adding [skip ci] will skip all push and pull_request workflows.
```

### Body

```text
[optional] {freeform} (max-length: 100)

Longer commit body with additional contextual information about the code changes.
```

### Footer

```text
<token>: <value>
[optional] (max-length: 100)
token (Sentance-case) = {
  'BREAKING CHANGE',    # Exception to the rule
  'Acked-by',
  'Cc',
  'Fixes',
  'Helped-by',
  'Refs',
  'Reviewed-by',
  'Signed-off-by',
}

Any number of tokens may be included.
```

### Examples

The following are all examples of valid commit messages.

The commit message will also go through validation with `commitlint` upon issuing `git commit`.

```text
feat(player): begin new implementation of input controller

As per #123 recommendation input contoller is now based on blah.

Basic movement added.

Acked-by: Alice <alice@example.com>
Signed-off-by: Bob <bob@example.com>
Refs: #123
Refs: 676104e, a215868
```

```text
fix: array parsing issue

Fixes: #42
Cc: Z
Reviewed-by: Z
Signed-off-by: Z
```

```text
chore(release): v0.0.1 [skip ci]
```

## Changelog

Once you have published at least one proper commit using conventional commits syntax you will be able to generate a changelog.

```bash
git cliff --tag 0.0.1
```

After the initial run of git-cliff all subsequent runs should detect the version automatically.

```bash
git cliff
```

A typical workflow should look like the following.

```bash
git add -A                      # add all un-indexed and changed files to the commit
git commit -S -a -m "<message>" # add a conventional commit message and sign the commit
git cliff                       # generate a new changelog
git add CHANGELOG.md            # add the changelog file to the commit
git commit --amend --no-edit    # ammend the added file to the previous un-pushed commit
git push -u origin develop      # finally, push the commit
```

## Unity Projects

### Unity Activation

Visit the repository page and navigate to `Actions`. Manually run the `Unity Activation 🔐` action and then download the artifact.

Extract the zip file somewhere accessible.

Visit [license.unity3d.com](https://license.unity3d.com/manual) and upload the `Unity_v20XX.X.XXXX.alf` file, receiving a license file `Unity_v20XX.X.ulf` in return.

Navigate on Github to `Settings > Secrets and variables > Actions`.

Create the following repository secrets:

* `UNITY_LICENSE` - (Copy the contents of your license file into here)
* `UNITY_EMAIL` - (Add the email address that you use to login to Unity)
* `UNITY_PASSWORD` - (Add the password that you use to login to Unity)

## Attribution

* [Commitlint](https://github.com/conventional-changelog/commitlint)
* [git-cliff](https://github.com/orhun/git-cliff)
