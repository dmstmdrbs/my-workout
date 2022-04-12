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
import { useRecoilState, useRecoilValue } from 'recoil';
import {
  categoryWorkoutSelector,
  searchWorkoutSelector,
  workoutCategoryState,
  workoutSearchState,
} from '../store';

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
      backgroundColor: '#474C65',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 14,
      marginHorizontal: 1,
      textOverflow: 'elipse',
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

const useSelectedWorkout = () => {
  const [selectedWorkoutList, setSelectedWorkoutList] = useState([]);

  const addWorkout = (workout) => {
    setSelectedWorkoutList((prev) => {
      if (prev.find((v) => v.id === workout.id)) return prev;
      return [workout, ...prev];
    });
  };

  return { selectedWorkoutList, addWorkout };
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

  const { selectedWorkoutList, addWorkout } = useSelectedWorkout();

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
              <Chip content={item} key={idx} onPress={(v) => setCategory(v)} />
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
            <Text key={workout.id} style={{ color: '#f5f5f5' }}>
              {workout.name}
            </Text>
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
            <Chip content={workout.name} key={workout.id} onPress={() => {}} />
          ))}
        </ScrollView>
        <AddWorkoutBtn
          onPress={() => {
            Alert.alert('운동 추가', '운동을 추가합니다.');
          }}
        >
          <BtnText>추가하기</BtnText>
        </AddWorkoutBtn>
      </View>
    </Container>
  );
};

export default AddWorkout;
