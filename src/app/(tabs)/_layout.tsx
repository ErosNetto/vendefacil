import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, typography } from '@/constants/theme';

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const bottomPadding = Math.max(insets.bottom, 10);
  const tabBarHeight = 56 + bottomPadding;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: tabBarHeight,
          paddingTop: 6,
          paddingBottom: bottomPadding,
        },
        tabBarLabelStyle: {
          ...typography.caption,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Início',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'home' : 'home-outline'}
              size={22}
              color={typeof color === 'string' ? color : colors.textSecondary}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="sales"
        options={{
          title: 'Vendas',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'cart' : 'cart-outline'}
              size={22}
              color={typeof color === 'string' ? color : colors.textSecondary}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="inventory"
        options={{
          title: 'Estoque',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'cube' : 'cube-outline'}
              size={22}
              color={typeof color === 'string' ? color : colors.textSecondary}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: 'Agenda',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'calendar' : 'calendar-outline'}
              size={22}
              color={typeof color === 'string' ? color : colors.textSecondary}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="finance"
        options={{
          title: 'Financeiro',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'wallet' : 'wallet-outline'}
              size={22}
              color={typeof color === 'string' ? color : colors.textSecondary}
            />
          ),
        }}
      />
    </Tabs>
  );
}
