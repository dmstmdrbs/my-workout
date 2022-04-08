import React from 'react';
import { StatusBar } from 'react-native';
import { useRecoilValue } from 'recoil';
import styled from '@emotion/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import Enter from './views/Enter';
import Workout from './views/Workout';
import { authState } from './store';

const Container = styled.SafeAreaView`
  flex: 1;
  align-items: center;
  justify-content: center;
  background-color: #f5f5f5;
`;

const Stack = createNativeStackNavigator();

const App = () => {
  const auth = useRecoilValue(authState);

  return (
    <Stack.Navigator initialRouteName="Enter">
      <Stack.Screen
        name="Enter"
        component={Enter}
        options={{ title: 'Enter' }}
      />
      <Stack.Screen
        name="Workout"
        component={Workout}
        options={{ title: 'Workout' }}
      />
    </Stack.Navigator>
  );
};

export default App;
