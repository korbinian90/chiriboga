# Netrunner: Solo Mode

A static, mobile-friendly fork of [drbo6/chiriboga](https://github.com/drbo6/chiriboga) (built on bobtheuberfish's [Chiriboga engine](https://github.com/bobtheuberfish/chiriboga)) packaged for hosting on GitHub Pages. Open it in any modern browser, or **Add to Home Screen** on iOS / **Install App** on Android for a fullscreen PWA experience.

**Play it:** https://korbinian90.github.io/chiriboga/

> ⚠️ This fork is an experiment in mobile-friendly static hosting. **No ongoing maintenance is planned.** Bugs and feature requests for the engine itself are best filed upstream at [drbo6/chiriboga/issues](https://github.com/drbo6/chiriboga/issues).

![License](https://img.shields.io/badge/license-GPL--3.0-green)

## Features

- 🤖 AI Corp opponent
- 🎮 Quick Game, Custom Game, Gauntlet (rogue-lite), and Tutorial
- 📚 Preconstructed decks
- 📱 Mobile-friendly UI, installable as a PWA

## What's different in this fork

The upstream PHP entry pages are rendered to HTML in a GitHub Actions workflow and deployed to Pages on every push to `dev`. No PHP runtime is required for visitors — everything runs in the browser.

## Local development

The source still uses PHP for templating. To run locally:

```bash
php -S localhost:8000
```

Card images are not in the repo for licensing reasons. Download from [chiriboga.cronbach.com/images/images.zip](https://chiriboga.cronbach.com/images/images.zip) and extract into `images/`.

For the debug menu, AI preference overrides, board-state setup helpers, and reproduction code, see the developer documentation in the upstream repo: [drbo6/chiriboga](https://github.com/drbo6/chiriboga#developer-documentation).

## Credits

- **Engine** — [bobtheuberfish](https://github.com/bobtheuberfish)
- **Solo Mode + Gauntlet system** — [DrBo6](https://github.com/drbo6)
- **Precons** — Girometics SG+SU21, NSG Core; additional curation by DrBo6
- **Testers** — BadEpsilon, bowlsley, D-Smith, eniteris, Kwaice, Mentlegen, olompumpa, R41B, saff, Saintis, Ysengrin

## Legal

*Netrunner* and *Android* are trademarks of Fantasy Flight Publishing, Inc. and/or Wizards of the Coast LLC. This is a fan-made project and is not affiliated with FFG, WotC, or Null Signal Games. Card art and symbols © Null Signal Games, used under [CC BY-ND 4.0](https://creativecommons.org/licenses/by-nd/4.0/).
