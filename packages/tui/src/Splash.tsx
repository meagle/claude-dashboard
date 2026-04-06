import React from 'react';
import { Box, Text } from 'ink';

const BACH_ART = `
██████╗  █████╗  ██████╗██╗  ██╗
██╔══██╗██╔══██╗██╔════╝██║  ██║
██████╔╝███████║██║     ███████║
██╔══██╗██╔══██║██║     ██╔══██║
██████╔╝██║  ██║╚██████╗██║  ██║
╚═════╝ ╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝`.trimStart();

const SUBTITLE  = '♩ ♪   orchestrating your claude sessions   ♫ ♬';
const STAFF     = '────────────────────────────────────────────────────';

export function Splash() {
  return (
    <Box flexDirection="column" alignItems="center" paddingY={1}>
      <Text color="yellow">{BACH_ART}</Text>
      <Box marginTop={1}>
        <Text color="yellow" dimColor>{STAFF}</Text>
      </Box>
      <Box marginTop={1}>
        <Text color="yellow" dimColor>{SUBTITLE}</Text>
      </Box>
    </Box>
  );
}
