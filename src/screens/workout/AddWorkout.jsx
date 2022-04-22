import React, { useEffect, useState } from 'react';
import styled from '@emotion/native';
import {
  Dimensions,
  Alert,
  View,
  TextInput,
  ScrollView,
  TouchableOpacity,
  Text,
} from 'react-native';
import { useRecoilState, useRecoilValue, useSetRecoilState } from 'recoil';
import {
  categoryWorkoutSelector,
  searchWorkoutSelector,
  Workout,
  workoutCategoryState,
  workoutSearchState,
} from '../../store';

import { storeData, getData } from '../../hooks/useAsyncStorage';
import { currentDateState, storedWorkoutState } from '../../store/workout';
import { CommonActions } from '@react-navigation/native';

const Width = Dimensions.get('window').width; //스크린 너비 초기화
const Height = Dimensions.get('window').height; //스크린 높이 초기화

const Container = styled.View`
  background-color: white;
  width: ${Width};
  align-items: center;
  justify-content: space-between;
  flex: 1;
`;

const AddWorkoutBtn = styled.TouchableOpacity`
  background-color: #525e75;
  padding-vertical: 10px;
  padding-horizontal: 40px;
  border-radius: 12px;
`;
const BtnText = styled.Text`
  font-size: 18px;
  color: #eeeeee;
`;

const Chip = ({ content, style, onPress }) => (
  <TouchableOpacity
    style={{
      minWidth: 80,
      paddingHorizontal: 10,
      height: 25,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 14,
      marginHorizontal: 1,
      textOverflow: 'elipse',
      backgroundColor: '#474C65',
      ...style,
    }}
    onPress={() => onPress(content)}
  >
    <Text style={{ color: '#f5f5f5' }}>{content}</Text>
  </TouchableOpacity>
);

const useWorkoutList = () => {
  // category 별로 workout list를 반환
  // 초기 카테고리는 '즐겨찾는 운동'
  const [searchValue, setSearchValue] = useRecoilState(workoutSearchState);
  const [category, setCategory] = useRecoilState(workoutCategoryState);
  const categorySelectedWorkout = useRecoilValue(categoryWorkoutSelector);
  const searchSelectedWorkout = useRecoilValue(searchWorkoutSelector);

  return {
    category,
    setCategory,
    searchValue,
    setSearchValue,
    categorySelectedWorkout,
    searchSelectedWorkout,
  };
};

const useSelectedWorkout = (navigation) => {
  const [currentDate, setCurrentDate] = useRecoilState(currentDateState);
  const [selectedWorkoutList, setSelectedWorkoutList] = useState([]);
  const storedWorkout = useRecoilValue(storedWorkoutState);

  useEffect(() => {
    console.log(navigation);
  }, []);

  const addWorkout = (workout) => {
    setSelectedWorkoutList((prev) => {
      if (prev.find((v) => v.id === workout.id)) return prev;
      return [workout, ...prev];
    });
  };
  const removeWorkout = (workoutId) => {
    setSelectedWorkoutList((prev) =>
      prev.filter((workout) => workout.id !== workoutId)
    );
  };

  const handleAddWorkoutList = async () => {
    if (selectedWorkoutList.length === 0) return;

    const newWorkout = selectedWorkoutList.map(
      (workout) => new Workout(workout.name, workout.category, currentDate)
    );
    const data = await getData('@stored_workout');
    const storedWorkout = data ? data : [];

    const newWorkoutList = [
      ...storedWorkout,
      ...newWorkout
        .filter((v) => !storedWorkout.find((x) => x.name === v.name))
        .map((v) => new Workout(v.name, v.category, currentDate)),
    ];

    await storeData('@stored_workout', newWorkoutList);
    // console.log(storedWorkout);
    // navigation.goBack();
    navigation.dispatch(CommonActions.goBack());
  };
  return {
    storedWorkout,
    selectedWorkoutList,
    addWorkout,
    removeWorkout,
    handleAddWorkoutList,
  };
};

const AddWorkout = ({ navigation }) => {
  const {
    category,
    setCategory,
    searchValue,
    setSearchValue,
    categorySelectedWorkout,
    searchSelectedWorkout,
  } = useWorkoutList();

  const {
    storedWorkout,
    selectedWorkoutList,
    addWorkout,
    removeWorkout,
    handleAddWorkoutList,
  } = useSelectedWorkout(navigation);

  return (
    <Container>
      <View
        style={{
          width: Width,
          justifyContent: 'flex-start',
          paddingHorizontal: 10,
          paddingVertical: 10,
          borderBottomColor: 'lightgray',
          borderBottomWidth: 1,
        }}
      >
        <TextInput
          value={searchValue}
          onChangeText={(text) => setSearchValue(text)}
          style={{
            width: '100%',
            padding: 5,
            borderColor: 'lightgray',
            borderWidth: 1,
            borderRadius: 6,
            marginVertical: 5,
          }}
          placeholder="운동을 검색하세요"
        />
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingVertical: 4,
          }}
        >
          <Chip
            content={'⭐'}
            style={{ backgroundColor: '#f5f5f5' }}
            onPress={() => setCategory('likes')}
          />
          <ScrollView
            horizontal={true}
            style={{
              flexDirection: 'row',
              width: '100%',
              marginLeft: 5,
              paddingVertical: 6,
            }}
          >
            {['하체', '가슴', '등', '어깨', '팔', '코어'].map((item, idx) => (
              <Chip
                content={item}
                key={idx}
                onPress={(v) => setCategory(v)}
                style={{
                  backgroundColor: category === item ? '#8E91A2' : '#474C65',
                }}
              />
            ))}
          </ScrollView>
        </View>
      </View>
      <ScrollView
        style={{
          width: Width,
          paddingHorizontal: 10,
          paddingVertical: 6,
          flex: 1,
        }}
      >
        {categorySelectedWorkout.map((workout) => (
          <TouchableOpacity
            key={workout.id}
            style={{
              width: '100%',
              paddingVertical: 10,
              paddingHorizontal: 15,
              backgroundColor: '#676B82',
              marginVertical: 5,
              borderRadius: 8,
            }}
            onPress={() => addWorkout(workout)}
          >
            <Text style={{ color: '#f5f5f5' }}>{workout.name}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View
        style={{
          width: Width,
          alignItems: 'center',
          paddingVertical: 8,
          borderTopWidth: 0.3,
          borderTopColor: 'lightgray',
        }}
      >
        <Text
          style={{
            width: Width,
            paddingHorizontal: 15,
            fontWeight: '600',
            fontSize: 16,
            color: '#222',
          }}
        >
          현재 선택 목록
        </Text>
        <ScrollView
          horizontal={true}
          style={{
            width: Width,
            paddingVertical: 10,
            paddingHorizontal: 10,
          }}
        >
          {selectedWorkoutList.map((workout) => (
            <Chip
              content={workout.name}
              key={workout.id}
              onPress={() => removeWorkout(workout.id)}
            />
          ))}
        </ScrollView>
        <AddWorkoutBtn onPress={handleAddWorkoutList}>
          <BtnText>추가하기</BtnText>
        </AddWorkoutBtn>
      </View>
    </Container>
  );
};

export default AddWorkout;
