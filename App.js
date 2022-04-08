import React from 'react';
import App from './src/App';
import { RecoilRoot } from 'recoil';
import { NavigationContainer } from '@react-navigation/native';

export default () => {
  return (
    <RecoilRoot>
      <NavigationContainer>
        <App />
      </NavigationContainer>
    </RecoilRoot>
  );
};
