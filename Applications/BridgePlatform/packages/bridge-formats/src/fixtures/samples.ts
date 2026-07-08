// Sample contexts for the "Load sample" buttons and tests. Both deals give the
// opener a 16-HCP balanced hand (♠AK4 ♥K32 ♦Q432 ♣KJ2) so a 15–17 1NT config
// fires a visible, config-cited opening.

export const SAMPLE_LIN =
  "pn|You,West,Partner,East|md|1SAK4HK32DQ432CKJ2|sv|o|ah|Board 1|";

export const SAMPLE_PBN = `[Event "bridgebot sample"]
[Board "1"]
[Dealer "N"]
[Vulnerable "None"]
[Deal "N:AK4.K32.Q432.KJ2 - - -"]
[Auction "N"]
1NT Pass 3NT AP
`;
