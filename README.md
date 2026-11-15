# Mars 404: Hide & Seek

### [▶ Play the game](https://mars-hide-seek-404.jms20c.chatgpt.site)

[View the seven-slide project demonstration](https://docs.google.com/presentation/d/1jagqPLYAW63mF0KAHdo_mQrZhF26YUiJ/edit?usp=drive_link)

**Close does not mean connected.** Mars 404 is an educational exploration game about restoring communication when Martian terrain blocks a signal. Players investigate the landscape, place a limited number of relays, and reconnect a base and exploration crews.

## How to play

1. Start a mission and read its objective.
2. Drag the 3D terrain to rotate it, scroll to zoom, and click a location on the terrain or 2D map to inspect it.
3. Review the estimated link conditions and open the terrain profiles. Orange shows terrain; green shows the line between antennas.
4. Place a relay. In missions with several relays, place additional relays as needed, then select **Check network**. If a link fails, investigate another location.
5. Use **Show hint** for guidance. **Need help? Explore another mission** opens levels directly; skipped missions are not marked complete.

## Missions

- **1 · The Lost Astronaut:** restore a link between the base and an astronaut using one relay.
- **2 · Two Signals:** connect two exploration sites using one relay.
- **3 · Into the Unknown:** connect a distant destination with up to three relays; fewer can also succeed.
- **4 · Records of Two Crews:** connect both crews within a planned 45 minutes. Choose between faster live video and a more signal-tolerant science summary; steeper sites take longer to set up. This is a calculated budget, not a real-time countdown.
- **5 · Beyond the Broken Signal:** extend the network and respond to a relay failure. A completed Level 4 layout carries over; direct access uses an example layout when none is available.

An astronaut field view is available in Level 1 after selecting a location and in Level 5 after the failure. Its overview map shows bearings and viewing direction; a marker does not guarantee line of sight or a working link.

## Mars data and model

The active missions use a processed elevation grid and an orthorectified image derived from HiRISE observations of the lower Mount Sharp area in Gale crater:

- [HiRISE Digital Terrain Model DTEEC_019698_1750_019988_1750_U01](https://stac.astrogeology.usgs.gov/api/collections/mro_hirise_socet_dtms/items/DTEEC_019698_1750_019988_1750_U01), NASA/JPL/University of Arizona/USGS. The 1 m source was averaged to an approximately 8 m grid for the game.
- [HiRISE RED orthorectified image ESP_019698_1750](https://astrogeo-ard.s3-us-west-2.amazonaws.com/mars/mro/hirise/controlled/dtm/ESP_019698_1750_ESP_019988_1750/ESP_019698_1750_RED_A_01_ORTHO.tif), NASA/JPL/University of Arizona/USGS. The image is resampled and colored for display.

The game uses a simplified educational S-band radio model and sampled terrain profiles. Levels 1–2 require line of sight and at least 3 dB signal margin for each required link. Later levels also allow an obstructed link when the estimated signal after diffraction meets the threshold. The 3D overview exaggerates terrain height for readability.

Mission characters, selected locations, equipment settings, setup times and scenarios are game assumptions. The calculations are simplified and are **not validated for real mission planning or safety decisions**.

## Technology and running locally

The game uses HTML, CSS, JavaScript and [Three.js](https://threejs.org/). Start a local web server in this directory and open the address it provides; opening the HTML file directly can prevent terrain data from loading. A network connection is needed to load Three.js from its CDN.

```sh
python3 -m http.server 8000
```

Then open `http://localhost:8000/`.

## AI use

The team used OpenAI tools to assist with brainstorming, research, coding, debugging and writing. AI-generated images in the presentation are identified there. The team directed the project, reviewed outputs and made the final design and implementation decisions.
