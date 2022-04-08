import React from 'react';
import styled from '@emotion/native';
import { Dimensions } from 'react-native';
import { useSetRecoilState } from 'recoil';
import { authState } from '../store';

const Width = Dimensions.get('window').width; //스크린 너비 초기화
const Height = Dimensions.get('window').height; //스크린 높이 초기화

const Container = styled.View`
  background-color: #f5f5f5;
  width: ${Width};
  align-items: center;
  justify-content: space-around;
  padding-vertical: 18px;
  flex: 1;
`;
const EnterText = styled.Text`
  font-size: 36px;
`;
const EnterBtn = styled.TouchableOpacity`
  background-color: #525e75;
  padding-vertical: 10px;
  padding-horizontal: 40px;
`;
const BtnText = styled.Text`
  font-size: 18px;
  color: #eeeeee;
`;
const Enter = ({ navigation }) => {
  const setAuth = useSetRecoilState(authState);

  return (
    <Container>
      <EnterText>My Workout</EnterText>
      <EnterBtn onPress={() => navigation.navigate('Workout')}>
        <BtnText>Enter</BtnText>
      </EnterBtn>
    </Container>
  );
};

export default Enter;
