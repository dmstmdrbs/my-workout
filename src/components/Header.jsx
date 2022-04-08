import React from 'react';
import styled from '@emotion/native';
import { Dimensions, Text } from 'react-native';
import { useSetRecoilState } from 'recoil';
import { authState } from '../store';

const Width = Dimensions.get('window').width; //스크린 너비 초기화
const Container = styled.View`
  width: ${Width};
  height: 60px;
  flex-direction: row;
  justify-content: space-between;
  background-color: #dfdfde;
  align-items: center;
`;
const HeaderIcon = styled.TouchableOpacity`
  height: 100%;
  width: 60px;
  align-items: center;
  justify-content: center;
  & > Text {
    font-size: 28px;
  }
`;
const HeaderTitle = styled.Text`
  font-size: 24px;
  font-weight: 600;
`;

export default Header = () => {
  const setAuth = useSetRecoilState(authState);

  return (
    <Container>
      <HeaderIcon onPress={() => setAuth(false)}>
        <Text>로그아웃</Text>
      </HeaderIcon>
      <HeaderTitle>운동 기록</HeaderTitle>
      <HeaderIcon></HeaderIcon>
    </Container>
  );
};
