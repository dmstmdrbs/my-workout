import React, { useEffect } from 'react';
import { ScrollView, Text, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  useRecoilState,
  useRecoilValueLoadable,
  useSetRecoilState,
} from 'recoil';

import WorkoutCard from '../../components/WorkoutCard';
import Stopwatch from '../../components/Stopwatch';

import { BtnWrapper, AddBtn } from '../../styles/screens/Workout.style';

import { workoutListState } from '../../store';
import {
  currentDateState,
  storedWorkoutState,
  forceUpdateWorkoutState,
} from '../../store/workout';

import { storeData } from '../../hooks/useAsyncStorage';

const Width = Dimensions.get('window').width; //스크린 너비 초기화
const Height = Dimensions.get('window').height; //스크린 높이 초기화

const useWorkoutDetail = (storedWorkoutLoadable) => {
  const [workoutList, setWorkoutList] = useRecoilState(workoutListState);

  useEffect(() => {
    if (storedWorkoutLoadable.state === 'hasValue') {
      setWorkoutList(storedWorkoutLoadable.contents);
    }
  }, [storedWorkoutLoadable.state]);

  const findWorkout = (id, list) => [
    list.findIndex((w) => w.id === id),
    list.find((w) => w.id === id),
  ];

  const handleMemo = (id, value) => {
    setWorkoutList((prev) => {
      const [currentWorkoutIdx, currentWorkout] = findWorkout(id, prev);
      const newWorkout = { ...currentWorkout, memo: value };

      return [
        ...prev.slice(0, currentWorkoutIdx),
        newWorkout,
        ...prev.slice(currentWorkoutIdx + 1),
      ];
    });
  };

  const handleAddSet = (id, weight, reps) => {
    setWorkoutList((prev) => {
      const [currentWorkoutIdx, currentWorkout] = findWorkout(id, prev);
      const newSet = {
        setId: Math.random().toString(36).substring(2, 11),
        weight: weight,
        reps: reps,
      };
      const newSets = [...currentWorkout.sets, newSet];

      return [
        ...prev.slice(0, currentWorkoutIdx),
        { ...currentWorkout, sets: newSets },
        ...prev.slice(currentWorkoutIdx + 1),
      ];
    });
  };
  const handleRemoveSet = (id, idx) => {
    setWorkoutList((prev) => {
      const [currentWorkoutIdx, currentWorkout] = findWorkout(id, prev);
      const currentSet = currentWorkout.sets;
      const newSets = [
        ...currentSet.slice(0, idx),
        ...currentSet.slice(idx + 1),
      ];

      return [
        ...prev.slice(0, currentWorkoutIdx),
        { ...currentWorkout, sets: newSets },
        ...prev.slice(currentWorkoutIdx + 1),
      ];
    });
  };
  return {
    workoutList,
    setWorkoutList,
    handleAddSet,
    handleRemoveSet,
    handleMemo,
  };
};

const Workout = ({ route, navigation }) => {
  const storedWorkoutLoadable = useRecoilValueLoadable(storedWorkoutState);
  const [selectedDate, setSelectedDate] = useRecoilState(currentDateState);
  const setIsNew = useSetRecoilState(forceUpdateWorkoutState);

  const {
    workoutList,
    setWorkoutList,
    handleAddSet,
    handleMemo,
    handleRemoveSet,
  } = useWorkoutDetail(storedWorkoutLoadable);

  useEffect(() => {
    if (route.params?.newWorkoutList) {
      const { newWorkoutList } = route.params;
      const newWorkout = JSON.parse(newWorkoutList);
      console.log(newWorkout);
      (async () => {
        await storeData('@stored_workout', newWorkoutList);
        setIsNew((prev) => prev + 1); // 새로 저장된 운동 목록을 불러오기 위함
      })();
    }
  }, [route.params]);

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
        {storedWorkoutLoadable.state === 'hasError' && (
          <Text>Error occurred</Text>
        )}
        {storedWorkoutLoadable.state === 'loading' && <Text>Loading...</Text>}
        {storedWorkoutLoadable.state === 'hasValue' && workoutList.length > 0
          ? workoutList.map((workout) => (
              <WorkoutCard
                key={workout.id}
                {...workout}
                editMemo={handleMemo}
                addSet={handleAddSet}
                removeSet={handleRemoveSet}
              />
            ))
          : null}
      </ScrollView>
    </SafeAreaView>
  );
};

export default Workout;
