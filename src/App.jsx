import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import AddWorkout from './views/AddWorkout';
import Workout from './views/Workout';

const Stack = createNativeStackNavigator();

const App = () => {
  return (
    <Stack.Navigator initialRouteName="Workout">
      <Stack.Screen
        name="AddWorkout"
        component={AddWorkout}
        options={{ title: '운동추가' }}
      />
      <Stack.Screen
        name="Workout"
        component={Workout}
        options={{ title: '운동기록' }}
      />
    </Stack.Navigator>
  );
};

export default App;
