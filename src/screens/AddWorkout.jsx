import React from 'react';
import styled from '@emotion/native';
import { Dimensions, Alert } from 'react-native';

const Width = Dimensions.get('window').width; //스크린 너비 초기화
const Height = Dimensions.get('window').height; //스크린 높이 초기화

const Container = styled.View`
  background-color: #f5f5f5;
  width: ${Width};
  align-items: center;
  justify-content: space-between;
  padding-vertical: 18px;
  flex: 1;
`;
const AddWorkoutText = styled.Text`
  font-size: 36px;
`;
const AddWorkoutBtn = styled.TouchableOpacity`
  background-color: #525e75;
  padding-vertical: 10px;
  padding-horizontal: 40px;
`;
const BtnText = styled.Text`
  font-size: 18px;
  color: #eeeeee;
`;
const AddWorkout = ({ navigation }) => {
  return (
    <Container>
      <AddWorkoutText>My Workout</AddWorkoutText>
      <AddWorkoutBtn
        onPress={() => {
          Alert.alert('운동 추가', '운동을 추가합니다.');
        }}
      >
        <BtnText>추가하기</BtnText>
      </AddWorkoutBtn>
    </Container>
  );
};

export default AddWorkout;
