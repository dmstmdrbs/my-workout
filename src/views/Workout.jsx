import React from 'react';
import styled from '@emotion/native';
import { ScrollView, View, Text } from 'react-native';
import { Dimensions } from 'react-native';

import Stopwatch from '../components/Stopwatch';

const Width = Dimensions.get('window').width; //스크린 너비 초기화
const Height = Dimensions.get('window').height; //스크린 높이 초기화

const BtnWrapper = styled.View`
  width: ${Width};
  align-items: center;
  padding: 10px;
`;
const AddBtn = styled.TouchableOpacity`
  width: 120px;
  height: 40px;
  justify-content: center;
  align-items: center;

  border-radius: 5px;
  background: #8675a9;
`;

const Workout = ({ navigation }) => {
  return (
    <View style={{ width: Width, height: Height }}>
      <Stopwatch startTitle="운동 시작하기" endTitle="운동 멈추기" />
      <BtnWrapper>
        <AddBtn onPress={() => navigation.navigate('AddWorkout')}>
          <Text style={{ color: 'white', fontSize: 18 }}>운동 추가</Text>
        </AddBtn>
      </BtnWrapper>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        style={{ flex: 1, backgroundColor: '#f5f5f5', width: Width }}
      ></ScrollView>
    </View>
  );
};

export default Workout;
