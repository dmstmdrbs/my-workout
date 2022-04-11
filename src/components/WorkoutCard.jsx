import React, { useEffect, useState } from 'react';
import { TouchableOpacity, View, Text, ScrollView } from 'react-native';
import styled from '@emotion/native';

const Container = styled.View`
  width: 95%;
  min-height: 150px;
  padding: 5px 16px;
  align-self: center;
  border-radius: 8px;
  border: 1px solid ${({ theme }) => theme.mainColors['100']};
  margin: 8px 0;
  background: #fefefe;
`;

const FlexRow = styled.View`
  flex-direction: row;
  justify-content: space-between;
  padding-vertical: 10px;
`;
const WorkoutDescription = styled(FlexRow)`
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  padding-vertical: 10px;
`;
const MemoInput = styled.TextInput`
  border: 1px solid ${(props) => props.theme.mainColors['100']};
  border-radius: 8px;
  padding: 4px 10px;
  flex: 1;
`;

const WorkoutVolume = styled.Text`
  color: ${(props) => props.theme.mainColors['300']};
  font-size: 14px;
  font-weight: 500;
`;
const WorkoutSetItem = styled(FlexRow)`
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  padding-vertical: 0;
`;
const WorkoutSetItemText = styled.Text`
  font-weight: 500;
  font-size: 17px;
  padding-left: 25px;
  text-align: right;
  padding-vertical: 3px;
`;

const WorkoutSetBtnContainer = styled(FlexRow)`
  justify-content: space-around;
  margin-top: 10px;
`;
const WorkoutSetBtn = styled.TouchableOpacity`
  border: 1px solid lightgray;
  border-radius: 4px;
  padding-vertical: 8px;
  padding-horizontal: 24px;
  background-color: ${(props) =>
    props.dark ? props.theme.mainColors['600'] : props.theme.mainColors['300']};
`;

export default WorkoutCard = ({ id, name, sets, memo, editMemo }) => {
  const [memoInput, setMemoInput] = useState(memo);

  useEffect(() => {
    editMemo(id, memoInput);
  }, [memoInput]);

  return (
    <Container>
      <View>
        <WorkoutDescription>
          <Text style={{ fontSize: 18, fontWeight: '700' }}>{name}</Text>
          <TouchableOpacity>
            <Text style={{ fontSize: 18, fontWeight: '600' }}> ... </Text>
          </TouchableOpacity>
        </WorkoutDescription>
        <WorkoutDescription style={{ paddingVertical: 0 }}>
          <WorkoutVolume>총 볼륨 2800kg</WorkoutVolume>
        </WorkoutDescription>
        <WorkoutDescription>
          <MemoInput
            placeholder="메모"
            value={memoInput}
            onChangeText={(text) => setMemoInput(text)}
          ></MemoInput>
        </WorkoutDescription>
      </View>
      <ScrollView>
        {sets.map((_, idx) => {
          return (
            <WorkoutSetItem key={idx}>
              <View style={{ flexDirection: 'row' }}>
                <WorkoutSetItemText
                  style={{ paddingLeft: 10, color: 'lightgray' }}
                >
                  {idx + 1}
                </WorkoutSetItemText>
                <WorkoutSetItemText>100kg</WorkoutSetItemText>
                <WorkoutSetItemText>10회</WorkoutSetItemText>
              </View>
              <TouchableOpacity>
                <Text>체크</Text>
              </TouchableOpacity>
            </WorkoutSetItem>
          );
        })}
      </ScrollView>
      <WorkoutSetBtnContainer>
        <WorkoutSetBtn dark={true}>
          <Text style={{ color: 'white' }}> - 세트 삭제</Text>
        </WorkoutSetBtn>
        <WorkoutSetBtn>
          <Text style={{ color: 'white' }}> + 세트 추가</Text>
        </WorkoutSetBtn>
      </WorkoutSetBtnContainer>
    </Container>
  );
};
