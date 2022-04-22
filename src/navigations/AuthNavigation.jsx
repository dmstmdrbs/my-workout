import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useRecoilValue } from 'recoil';

import SignIn from '../screens/auth/singIn';
import MainNavigation from './MainNavigation';
import { userState } from '../store/auth';

const Stack = createNativeStackNavigator();

export default AuthNavigation = () => {
  const isUser = useRecoilValue(userState);

  if (!isUser)
    return (
      <Stack.Navigator
        initialRouteName="SingIn"
        screenOptions={{
          headerShown: true,
          headerStyle: {
            backgroundColor: '#474C65',
          },
          headerTitleStyle: {
            alignItems: 'center',
            justifyContent: 'center',
            flex: 1,
            color: 'white',
          },
        }}
      >
        <Stack.Screen
          name="SingIn"
          component={SignIn}
          options={{
            title: '로그인',
          }}
        />
      </Stack.Navigator>
    );
  else return <MainNavigation />;
};
