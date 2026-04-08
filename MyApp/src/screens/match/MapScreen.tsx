import React from 'react';
import {View, Text, StyleSheet} from 'react-native';

export default function MapScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>근처</Text>
      <Text style={styles.sub}>MATCH-03 구현 예정</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff'},
  title: {fontSize: 20, fontWeight: '600', color: '#222'},
  sub: {fontSize: 14, color: '#aaa', marginTop: 8},
});
