import { StyleSheet, Text, View } from 'react-native';

// expo-router requires a default export for every file under app/.
export default function Index() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Twake Visio</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
  },
});
