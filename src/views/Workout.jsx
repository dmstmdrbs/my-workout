import React from 'react';
import { ScrollView } from 'react-native';
import { Dimensions } from 'react-native';

import Stopwatch from '../components/Stopwatch';

const Width = Dimensions.get('window').width; //스크린 너비 초기화
const Height = Dimensions.get('window').height; //스크린 높이 초기화

const Workout = () => {
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={{ flex: 1, backgroundColor: '#f5f5f5', width: Width }}
    >
      <Stopwatch startTitle="운동 시작하기" endTitle="운동 멈추기" />
    </ScrollView>
  );
};

export default Workout;
