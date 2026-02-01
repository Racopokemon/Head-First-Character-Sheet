# Head First! Character sheet

A simple online character sheet for yet another little TTRPG ruleset. 
The idea that sets this one apart from other ones is its two-staged approach, starting from base attributes that can then be improved for more specific skills. 

The character sheet may be customized by the gm to fit their needs: The localization, name and number of skills etc. can be set beforehand, by modifying a downloaded .json file and only sending the `set_by_gm` part back to the players. 

Right now, I'm hosting it [here](https://racopokemon.github.io/Head-First-Character-Sheet/), feel free to try it :)





(This has to be fixed at some point)

## Running locally: 

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start MongoDB (locally or configure `.env` with remote URI)

3. Start the server:
   ```bash
   npm start
   ```
   Or with auto-reload:
   ```bash
   npm run dev
   ```

4. Open browser at `http://localhost:3000`