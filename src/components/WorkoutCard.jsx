import React, { useEffect, useState } from 'react';
import {
  TouchableOpacity,
  View,
  Text,
  ScrollView,
  TextInput,
} from 'react-native';
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

export default WorkoutCard = ({
  id,
  name,
  sets,
  memo,
  editMemo,
  addSet,
  removeSet,
}) => {
  const [memoInput, setMemoInput] = useState(memo);

  const [addMode, setAddMode] = useState(false);
  const [removeMode, setRemoveMode] = useState(false);
  const [weight, setWeight] = useState(null);
  const [reps, setReps] = useState(null);

  useEffect(() => {
    editMemo(id, memoInput);
  }, [memoInput]);

  const closeAddForm = () => {
    setAddMode(false);
    setWeight('');
    setReps('');
  };
  const handleAddSetSubmit = () => {
    if (!isNaN(weight) && !isNaN(reps)) {
      addSet(id, weight, reps);
      closeAddForm();
    }
  };

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
          <WorkoutVolume>
            ??? ??????{' '}
            {sets.reduce((acc, cur) => {
              acc += cur.weight * cur.reps;
              return acc;
            }, 0)}
            kg
          </WorkoutVolume>
        </WorkoutDescription>
        <WorkoutDescription>
          <MemoInput
            placeholder="??????"
            value={memoInput}
            onChangeText={(text) => setMemoInput(text)}
          ></MemoInput>
        </WorkoutDescription>
      </View>
      <ScrollView>
        {sets.map((v, idx) => {
          return (
            <WorkoutSetItem key={v.setId}>
              <View style={{ flexDirection: 'row' }}>
                {removeMode ? (
                  <TouchableOpacity onPress={() => removeSet(id, idx)}>
                    <WorkoutSetItemText style={{ color: 'red' }}>
                      {'-'}
                    </WorkoutSetItemText>
                  </TouchableOpacity>
                ) : (
                  <WorkoutSetItemText
                    style={{ paddingLeft: 10, color: 'lightgray' }}
                  >
                    {idx + 1}
                  </WorkoutSetItemText>
                )}
                <WorkoutSetItemText>{v.weight}kg</WorkoutSetItemText>
                <WorkoutSetItemText>{v.reps}???</WorkoutSetItemText>
              </View>
              <TouchableOpacity>
                <Text>??????</Text>
              </TouchableOpacity>
            </WorkoutSetItem>
          );
        })}
      </ScrollView>
      {addMode && (
        <View
          style={{
            marginTop: 15,
            paddingVertical: 5,
            paddingHorizontal: 15,
            borderRadius: 10,
            borderColor: 'lightgray',
            borderWidth: 1,
          }}
        >
          <FlexRow>
            <TextInput
              style={{
                width: '45%',
                borderColor: 'gray',
                borderWidth: 1,
                borderRadius: 5,
                paddingVertical: 2,
                paddingHorizontal: 10,
              }}
              placeholder="??????"
              value={weight}
              onChangeText={(text) => setWeight(text)}
            ></TextInput>
            <TextInput
              style={{
                width: '45%',
                borderColor: 'gray',
                borderWidth: 1,
                borderRadius: 5,
                paddingVertical: 2,
                paddingHorizontal: 10,
              }}
              placeholder="??????"
              value={reps}
              onChangeText={(text) => setReps(text)}
            ></TextInput>
          </FlexRow>
          <WorkoutSetBtnContainer>
            <WorkoutSetBtn onPress={closeAddForm}>
              <Text style={{ color: 'white' }}>??????</Text>
            </WorkoutSetBtn>
            <WorkoutSetBtn onPress={handleAddSetSubmit}>
              <Text style={{ color: 'white' }}>??????</Text>
            </WorkoutSetBtn>
          </WorkoutSetBtnContainer>
        </View>
      )}
      <WorkoutSetBtnContainer>
        <WorkoutSetBtn
          dark={true}
          onPress={() => {
            setAddMode(false);
            setRemoveMode((prev) => !prev);
          }}
        >
          <Text style={{ color: 'white' }}>
            {removeMode ? '????????????' : '????????????'}
          </Text>
        </WorkoutSetBtn>
        <WorkoutSetBtn
          onPress={() => {
            setRemoveMode(false);
            setAddMode(true);
          }}
        >
          <Text style={{ color: 'white' }}>+ ?????? ??????</Text>
        </WorkoutSetBtn>
      </WorkoutSetBtnContainer>
    </Container>
  );
};
