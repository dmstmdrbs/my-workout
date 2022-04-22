import React, { useState } from 'react';
import { Alert } from 'react-native';
import styled from '@emotion/native';
import { userState } from '../../store/auth';
import { useRecoilState } from 'recoil';
import axios from 'axios';

const Container = styled.SafeAreaView`
  width: 100%;
  height: 100%;
  background: white;
  align-items: center;
  padding: 100px 20px;
`;
const LoginForm = styled.KeyboardAvoidingView`
  flex: 1;
  width: 100%;
  padding-top: 10%;
  align-items: center;
`;
const Title = styled.Text`
  font-weight: 600;
  font-size: 36px;
  margin-vertical: 40px;
`;

const InputContainer = styled.View`
  align-items: flex-start;
  width: 100%;
`;
const InputLabel = styled.Text`
  font-size: 16px;
  font-weight: 500;
`;
const Input = styled.TextInput`
  width: 100%;
  padding: 8px 12px;
  border-radius: 4px;
  border: 1px solid black;
  background: white;
  margin: 5px 0;
`;

const SignInBtn = styled.TouchableOpacity`
  margin-vertical: 10px;
  width: 50%;
  background: ${({ theme }) => theme.mainColors[500]};
  padding: 10px;
  border-radius: 5px;
  &:active {
    opacity: 0.8;
  }
`;
const SignInText = styled.Text`
  color: white;
  font-size: 18px;
  text-align: center;
`;
const SignUpBtn = styled(SignInBtn)`
  background: #222;
`;

const SignIn = () => {
  const [user, setUser] = useRecoilState(userState);
  const [userValue, setUserValue] = useState();
  const onPressSignUp = async () => {
    const { data } = await axios
      .post('http://10.0.2.2:5000/api/user', {
        name: userValue,
      })
      .catch((err) => console.error(err));

    const { message, status } = data;
    Alert.alert('회원가입', message);
    if (status === 'FAIL') {
      setUserValue('');
    }
  };
  const onPressSignIn = async () => {
    const { data } = await axios
      .post('http://10.0.2.2:5000/api/user/signIn', {
        name: userValue,
      })
      .catch((err) =>
        Alert.alert(
          '에러',
          '인증 과정에서 에러가 발생하였습니다. 고객센터에 문의해주세요.'
        )
      );
    const { message, status } = data;
    if (status === 'FAIL') {
      Alert.alert('로그인 실패', message);
      return;
    }

    setUser(userValue);
    setUserValue('');
  };
  return (
    <Container>
      <LoginForm>
        <Title>운동 기록</Title>
        <InputContainer>
          <InputLabel>사용자 이름</InputLabel>

          <Input
            value={userValue}
            onChangeText={(text) => setUserValue(text)}
          ></Input>
        </InputContainer>
        <InputLabel>{userValue}</InputLabel>
        <SignInBtn onPress={() => setUser('admin')}>
          <SignInText>로그인</SignInText>
        </SignInBtn>
        <SignUpBtn onPress={onPressSignUp}>
          <SignInText>가입하기</SignInText>
        </SignUpBtn>
      </LoginForm>
    </Container>
  );
};
export default SignIn;
