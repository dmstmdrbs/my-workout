import React from 'react';
import App from './src/App';
import { RecoilRoot } from 'recoil';
import { ThemeProvider } from '@emotion/react';
import { NavigationContainer } from '@react-navigation/native';
import { theme } from './src/styles/theme';

export default () => {
  return (
    <RecoilRoot>
      <ThemeProvider theme={theme}>
        <NavigationContainer>
          <App />
        </NavigationContainer>
      </ThemeProvider>
    </RecoilRoot>
  );
};
