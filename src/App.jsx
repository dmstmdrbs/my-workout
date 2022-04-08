import React from 'react';
import { StatusBar } from 'react-native';
import { RecoilRoot } from 'recoil';
import styled from '@emotion/native';

const WelcomeContainer = styled.SafeAreaView`
  flex: 1;
  align-items: center;
  justify-content: center;
  background-color: #f5f5f5;
`;

const WelcomeText = styled.Text`
  font-size: 28px;

  font-weight: 700;
  color: #222;
`;
const App = () => {
  return (
    <RecoilRoot>
      <WelcomeContainer>
        <StatusBar />
        <WelcomeText>새 애플리케이션</WelcomeText>
      </WelcomeContainer>
    </RecoilRoot>
  );
};

export default App;
