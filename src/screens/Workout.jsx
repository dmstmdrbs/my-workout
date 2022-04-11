import React, { useEffect } from 'react';
import styled from '@emotion/native';
import { ScrollView, Text } from 'react-native';
import { Dimensions } from 'react-native';

import WorkoutCard from '../components/WorkoutCard';
import Stopwatch from '../components/Stopwatch';
import { useRecoilState } from 'recoil';
import { workoutListState } from '../store';
import { SafeAreaView } from 'react-native-safe-area-context';

const Width = Dimensions.get('window').width; //스크린 너비 초기화
const Height = Dimensions.get('window').height; //스크린 높이 초기화

const BtnWrapper = styled.View`
  width: 95%;
  align-items: center;
  padding: 10px;
  border-bottom-width: 1px;
  border-bottom-color: ${(props) => props.theme.mainColors['100']};
`;
const AddBtn = styled.TouchableOpacity`
  width: 120px;
  height: 40px;
  justify-content: center;
  align-items: center;

  border-radius: 5px;
  background: ${(props) => props.theme.mainColors['500']};
`;
const Workout = ({ navigation }) => {
  const [workoutList, setWorkoutList] = useRecoilState(workoutListState);

  useEffect(() => {
    console.log(workoutList);
  }, []);

  const handleMemo = (id, value) => {
    setWorkoutList((prev) => {
      const currentWorkoutIdx = prev.findIndex((w) => w.id === id);
      const currentWorkout = prev.find((w) => w.id === id);
      const newWorkout = { ...currentWorkout, memo: value };

      return [
        ...prev.slice(0, currentWorkoutIdx),
        newWorkout,
        ...prev.slice(currentWorkoutIdx + 1),
      ];
    });
  };

  return (
    <SafeAreaView
      style={{
        width: Width,
        height: Height,
        alignItems: 'center',
        flex: 1,
        backgroundColor: 'white',
      }}
    >
      <Stopwatch startTitle="운동 시작하기" endTitle="운동 멈추기" />
      <BtnWrapper>
        <AddBtn onPress={() => navigation.navigate('AddWorkout')}>
          <Text style={{ color: 'white', fontSize: 18 }}>운동 추가</Text>
        </AddBtn>
      </BtnWrapper>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        style={{
          backgroundColor: 'white',
          width: Width,
        }}
      >
        {workoutList.map((workout) => (
          <WorkoutCard key={workout.id} {...workout} editMemo={handleMemo} />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
};

export default Workout;
