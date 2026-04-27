import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  StatusBar,
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Modal,
  Animated,
  Dimensions,
  Pressable,
  SafeAreaView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Sentry from '@sentry/react-native';

const SIDEBAR_WIDTH = Math.min(300, Math.round(Dimensions.get('window').width * 0.8));

Sentry.init({
  dsn: 'https://87017698d4b272551e11269caf09c743@o4509054949195776.ingest.de.sentry.io/4511145260154960',
  tracesSampleRate: 1.0,
  debug: __DEV__,
});

interface GradeRow {
  id: string;
  assignment: string;
  grade: string;
  weight: string;
}

interface SavedCalculation {
  id: string;
  name: string;
  rows: GradeRow[];
  savedAt: number;
}

const STORAGE_KEY = '@exam-calculator/saved-calculations';

function parseGrade(value: string): number | null {
  const num = parseFloat(value.trim());
  return isNaN(num) ? null : num;
}

function getLetterGrade(pct: number): string {
  if (pct >= 97) return 'A+';
  if (pct >= 93) return 'A';
  if (pct >= 90) return 'A-';
  if (pct >= 87) return 'B+';
  if (pct >= 83) return 'B';
  if (pct >= 80) return 'B-';
  if (pct >= 77) return 'C+';
  if (pct >= 73) return 'C';
  if (pct >= 70) return 'C-';
  if (pct >= 67) return 'D+';
  if (pct >= 63) return 'D';
  if (pct >= 60) return 'D-';
  return 'F';
}

let rowCounter = 3;
const makeId = () => String(++rowCounter);

const INITIAL_ROWS: GradeRow[] = [
  { id: '1', assignment: 'Homework 1', grade: '90', weight: '5' },
  { id: '2', assignment: 'Project', grade: '85', weight: '20' },
  { id: '3', assignment: 'Midterm Exam', grade: '88', weight: '20' },
];

function App() {
  const [rows, setRows] = useState<GradeRow[]>(INITIAL_ROWS);
  const [result, setResult] = useState<{ pct: number; letter: string } | null>(null);
  const [saved, setSaved] = useState<SavedCalculation[]>([]);
  const [currentName, setCurrentName] = useState<string | null>(null);
  const [saveModalVisible, setSaveModalVisible] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarMounted, setSidebarMounted] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const sidebarAnim = useRef(new Animated.Value(-SIDEBAR_WIDTH)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (sidebarOpen) {
      // Mount first; animation runs after mount via the next effect
      setSidebarMounted(true);
    } else if (sidebarMounted) {
      Animated.parallel([
        Animated.timing(sidebarAnim, {
          toValue: -SIDEBAR_WIDTH,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.timing(backdropAnim, {
          toValue: 0,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) setSidebarMounted(false);
      });
    }
  }, [sidebarOpen, sidebarMounted, sidebarAnim, backdropAnim]);

  // When the modal first mounts, slide the sidebar in
  useEffect(() => {
    if (sidebarMounted && sidebarOpen) {
      sidebarAnim.setValue(-SIDEBAR_WIDTH);
      backdropAnim.setValue(0);
      Animated.parallel([
        Animated.timing(sidebarAnim, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(backdropAnim, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [sidebarMounted, sidebarOpen, sidebarAnim, backdropAnim]);

  const openSidebar = useCallback(() => setSidebarOpen(true), []);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  // Load saved calculations on mount
  useEffect(() => {
    (async () => {
      try {
        const json = await AsyncStorage.getItem(STORAGE_KEY);
        if (json) {
          const parsed: SavedCalculation[] = JSON.parse(json);
          setSaved(parsed);
        }
      } catch (error) {
        Sentry.captureException(error);
      }
    })();
  }, []);

  const persist = useCallback(async (next: SavedCalculation[]) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch (error) {
      Sentry.captureException(error);
      Alert.alert('Error', 'Failed to save to storage.');
    }
  }, []);

  const openSaveModal = useCallback(() => {
    setNameInput(currentName ?? '');
    setSaveModalVisible(true);
  }, [currentName]);

  const confirmSave = useCallback(async () => {
    const name = nameInput.trim();
    if (!name) {
      Alert.alert('Name required', 'Please enter a name for this calculation.');
      return;
    }

    const existingIndex = saved.findIndex(s => s.name.toLowerCase() === name.toLowerCase());

    const doSave = async () => {
      const entry: SavedCalculation = {
        id: existingIndex >= 0 ? saved[existingIndex].id : `calc-${Date.now()}`,
        name,
        rows: rows.map(r => ({ ...r })),
        savedAt: Date.now(),
      };
      const next = existingIndex >= 0
        ? saved.map((s, i) => (i === existingIndex ? entry : s))
        : [...saved, entry];
      setSaved(next);
      setCurrentName(name);
      await persist(next);
      setSaveModalVisible(false);
      setNameInput('');
    };

    if (existingIndex >= 0) {
      Alert.alert(
        'Overwrite?',
        `A calculation named "${name}" already exists. Overwrite it?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Overwrite', style: 'destructive', onPress: doSave },
        ],
      );
    } else {
      await doSave();
    }
  }, [nameInput, rows, saved, persist]);

  const loadCalculation = useCallback((calc: SavedCalculation) => {
    const cloned = calc.rows.map(r => ({ ...r }));
    // Ensure rowCounter stays ahead of any loaded ids that look numeric
    for (const r of cloned) {
      const n = parseInt(r.id, 10);
      if (!isNaN(n) && n > rowCounter) rowCounter = n;
    }
    setRows(cloned.length ? cloned : [{ id: makeId(), assignment: '', grade: '', weight: '' }]);
    setCurrentName(calc.name);
    setResult(null);
    setSidebarOpen(false);
  }, []);

  const deleteCalculation = useCallback((calc: SavedCalculation) => {
    Alert.alert(
      'Delete?',
      `Delete saved calculation "${calc.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const next = saved.filter(s => s.id !== calc.id);
            setSaved(next);
            if (currentName === calc.name) setCurrentName(null);
            await persist(next);
          },
        },
      ],
    );
  }, [saved, currentName, persist]);

  const updateRow = useCallback((id: string, field: keyof GradeRow, value: string) => {
    setRows(prev => prev.map(r => (r.id === id ? { ...r, [field]: value } : r)));
  }, []);

  const addRow = useCallback(() => {
    setRows(prev => [...prev, { id: makeId(), assignment: '', grade: '', weight: '' }]);
  }, []);

  const removeRow = useCallback((id: string) => {
    setRows(prev => (prev.length <= 1 ? prev : prev.filter(r => r.id !== id)));
  }, []);

  const calculate = useCallback(() => {
    try {
      let totalWeight = 0;
      let weightedSum = 0;
      let hasValidRow = false;

      for (const row of rows) {
        const grade = parseGrade(row.grade);
        const weight = parseFloat(row.weight);
        if (grade === null || isNaN(weight) || weight <= 0) continue;
        hasValidRow = true;
        weightedSum += grade * weight;
        totalWeight += weight;
      }

      if (!hasValidRow || totalWeight === 0) {
        Alert.alert('Error', 'Please enter at least one row with a valid grade and weight.');
        return;
      }

      const pct = weightedSum / totalWeight;
      setResult({ pct: Math.round(pct * 100) / 100, letter: getLetterGrade(pct) });
    } catch (error) {
      Sentry.captureException(error);
      Alert.alert('Error', 'Something went wrong calculating your grade.');
    }
  }, [rows]);

  const clear = useCallback(() => {
    setRows([{ id: makeId(), assignment: '', grade: '', weight: '' }]);
    setResult(null);
    setCurrentName(null);
  }, []);

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar barStyle="light-content" />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.titleRow}>
          <TouchableOpacity
            style={styles.menuBtn}
            onPress={openSidebar}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={styles.menuIcon}>☰</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Grade Calculator</Text>
        </View>
        <Text style={styles.subtitle}>
          Calculate your weighted average grade based on numeric scores and weights.
        </Text>

        {currentName && (
          <Text style={styles.currentName}>Current: {currentName}</Text>
        )}

        {/* Save Button */}
        <View style={styles.saveLoadRow}>
          <TouchableOpacity style={styles.saveLoadBtn} onPress={openSaveModal}>
            <Text style={styles.saveLoadBtnText}>Save Calculation</Text>
          </TouchableOpacity>
        </View>

        {/* Table Header */}
        <View style={styles.headerRow}>
          <Text style={[styles.headerCell, styles.nameCol]}>Assignment</Text>
          <Text style={[styles.headerCell, styles.gradeCol]}>Grade</Text>
          <Text style={[styles.headerCell, styles.weightCol]}>Weight</Text>
          <View style={styles.actionCol} />
        </View>

        {/* Table Rows */}
        {rows.map((row) => (
          <View key={row.id} style={styles.tableRow}>
            <TextInput
              style={[styles.input, styles.nameCol]}
              placeholder="Assignment"
              placeholderTextColor="#999"
              value={row.assignment}
              onChangeText={v => updateRow(row.id, 'assignment', v)}
            />
            <TextInput
              style={[styles.input, styles.gradeCol]}
              placeholder="Grade"
              placeholderTextColor="#999"
              value={row.grade}
              onChangeText={v => updateRow(row.id, 'grade', v)}
              keyboardType="numeric"
            />
            <TextInput
              style={[styles.input, styles.weightCol]}
              placeholder="Wt %"
              placeholderTextColor="#999"
              value={row.weight}
              onChangeText={v => updateRow(row.id, 'weight', v)}
              keyboardType="numeric"
            />
            <TouchableOpacity
              style={styles.actionCol}
              onPress={() => removeRow(row.id)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.removeBtn}>✕</Text>
            </TouchableOpacity>
          </View>
        ))}

        {/* Add Row */}
        <TouchableOpacity style={styles.addRowBtn} onPress={addRow}>
          <Text style={styles.addRowText}>+ Add Row</Text>
        </TouchableOpacity>

        {/* Action Buttons */}
        <View style={styles.buttonRow}>
          <TouchableOpacity style={styles.calcBtn} onPress={calculate}>
            <Text style={styles.calcBtnText}>Calculate</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.clearBtn} onPress={clear}>
            <Text style={styles.clearBtnText}>Clear</Text>
          </TouchableOpacity>
        </View>

        {/* Result */}
        {result && (
          <View style={styles.resultBox}>
            <Text style={styles.resultLabel}>Weighted Grade</Text>
            <Text style={styles.resultValue}>
              {result.pct}%  ({result.letter})
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Save Modal */}
      <Modal
        visible={saveModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setSaveModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <Pressable style={styles.modalOverlay} onPress={() => setSaveModalVisible(false)}>
            <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>Save Calculation</Text>
            <Text style={styles.modalSubtitle}>Enter a name (e.g. class or module)</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="e.g. CS101 - Fall"
              placeholderTextColor="#999"
              value={nameInput}
              onChangeText={setNameInput}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={confirmSave}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnSecondary]}
                onPress={() => setSaveModalVisible(false)}
              >
                <Text style={styles.modalBtnSecondaryText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnPrimary]}
                onPress={confirmSave}
              >
                <Text style={styles.modalBtnPrimaryText}>Save</Text>
              </TouchableOpacity>
            </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* Sidebar (in Modal so it sits above everything and reliably receives touches) */}
      <Modal
        visible={sidebarMounted}
        transparent
        animationType="none"
        onRequestClose={closeSidebar}
      >
        <View style={styles.sidebarRoot}>
          <Animated.View
            style={[styles.sidebarBackdrop, { opacity: backdropAnim }]}
          >
            <Pressable style={styles.flex} onPress={closeSidebar} />
          </Animated.View>

          <Animated.View
            style={[
              styles.sidebar,
              { width: SIDEBAR_WIDTH, transform: [{ translateX: sidebarAnim }] },
            ]}
          >
            <SafeAreaView style={styles.flex}>
              <View style={styles.sidebarHeader}>
                <Text style={styles.sidebarTitle}>Saved</Text>
                <TouchableOpacity
                  style={styles.sidebarCloseBtn}
                  onPress={closeSidebar}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                  <Text style={styles.sidebarClose}>✕</Text>
                </TouchableOpacity>
              </View>
              <ScrollView style={styles.flex} contentContainerStyle={styles.sidebarList}>
                {saved.length === 0 ? (
                  <Text style={styles.emptyText}>No saved calculations yet.</Text>
                ) : (
                  [...saved]
                    .sort((a, b) => b.savedAt - a.savedAt)
                    .map(calc => {
                      const active = currentName === calc.name;
                      return (
                        <View
                          key={calc.id}
                          style={[styles.savedRow, active && styles.savedRowActive]}
                        >
                          <TouchableOpacity
                            style={styles.savedRowMain}
                            onPress={() => loadCalculation(calc)}
                          >
                            <Text style={styles.savedName} numberOfLines={1}>
                              {calc.name}
                            </Text>
                            <Text style={styles.savedMeta}>
                              {calc.rows.length} row{calc.rows.length === 1 ? '' : 's'} ·{' '}
                              {new Date(calc.savedAt).toLocaleDateString()}
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.savedDelete}
                            onPress={() => deleteCalculation(calc)}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <Text style={styles.removeBtn}>✕</Text>
                          </TouchableOpacity>
                        </View>
                      );
                    })
                )}
              </ScrollView>
            </SafeAreaView>
          </Animated.View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

export default Sentry.wrap(App);

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  content: {
    padding: 20,
    paddingTop: 60,
    paddingBottom: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: '#aaa',
    marginBottom: 24,
    lineHeight: 20,
  },
  headerRow: {
    flexDirection: 'row',
    borderBottomWidth: 2,
    borderBottomColor: '#3a3a5c',
    paddingBottom: 8,
    marginBottom: 4,
  },
  headerCell: {
    fontWeight: '600',
    fontSize: 13,
    color: '#ccc',
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 4,
  },
  nameCol: { flex: 3, marginRight: 8 },
  gradeCol: { flex: 2, marginRight: 8 },
  weightCol: { flex: 1.5, marginRight: 4 },
  actionCol: { width: 30, alignItems: 'center', justifyContent: 'center' },
  input: {
    backgroundColor: '#16213e',
    borderWidth: 1,
    borderColor: '#3a3a5c',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
    fontSize: 15,
    color: '#fff',
  },
  removeBtn: {
    color: '#ff6b6b',
    fontSize: 16,
    fontWeight: '700',
  },
  addRowBtn: {
    marginTop: 10,
    marginBottom: 20,
    alignSelf: 'flex-start',
  },
  addRowText: {
    color: '#4fc3f7',
    fontSize: 15,
    fontWeight: '600',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  calcBtn: {
    flex: 1,
    backgroundColor: '#4fc3f7',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  calcBtnText: {
    color: '#1a1a2e',
    fontSize: 17,
    fontWeight: '700',
  },
  clearBtn: {
    flex: 1,
    backgroundColor: '#2a2a4a',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#3a3a5c',
  },
  clearBtnText: {
    color: '#ccc',
    fontSize: 17,
    fontWeight: '600',
  },
  resultBox: {
    backgroundColor: '#0f3460',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
  },
  resultLabel: {
    fontSize: 14,
    color: '#aaa',
    marginBottom: 6,
  },
  resultValue: {
    fontSize: 32,
    fontWeight: '700',
    color: '#4fc3f7',
  },
  currentName: {
    fontSize: 13,
    color: '#4fc3f7',
    marginBottom: 12,
    fontStyle: 'italic',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  menuBtn: {
    paddingRight: 14,
    paddingVertical: 4,
  },
  menuIcon: {
    color: '#4fc3f7',
    fontSize: 22,
    fontWeight: '700',
  },
  saveLoadRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  saveLoadBtn: {
    flex: 1,
    backgroundColor: '#2a2a4a',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#3a3a5c',
  },
  saveLoadBtnText: {
    color: '#4fc3f7',
    fontSize: 14,
    fontWeight: '600',
  },
  sidebarBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    zIndex: 10,
    elevation: 10,
  },
  sidebarRoot: {
    flex: 1,
  },
  sidebar: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    backgroundColor: '#13132a',
    borderRightWidth: 1,
    borderRightColor: '#3a3a5c',
    shadowColor: '#000',
    shadowOffset: { width: 2, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 20,
    zIndex: 20,
  },
  sidebarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#3a3a5c',
  },
  sidebarTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  sidebarCloseBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  sidebarClose: {
    color: '#aaa',
    fontSize: 20,
    fontWeight: '700',
  },
  sidebarList: {
    padding: 12,
    paddingBottom: 24,
  },
  savedRowActive: {
    borderWidth: 1,
    borderColor: '#4fc3f7',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '80%',
    backgroundColor: '#1a1a2e',
    borderRadius: 14,
    padding: 20,
    borderWidth: 1,
    borderColor: '#3a3a5c',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 13,
    color: '#aaa',
    marginBottom: 14,
  },
  modalInput: {
    backgroundColor: '#16213e',
    borderWidth: 1,
    borderColor: '#3a3a5c',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
    color: '#fff',
    marginBottom: 16,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  modalBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalBtnPrimary: {
    backgroundColor: '#4fc3f7',
  },
  modalBtnPrimaryText: {
    color: '#1a1a2e',
    fontSize: 15,
    fontWeight: '700',
  },
  modalBtnSecondary: {
    backgroundColor: '#2a2a4a',
    borderWidth: 1,
    borderColor: '#3a3a5c',
  },
  modalBtnSecondaryText: {
    color: '#ccc',
    fontSize: 15,
    fontWeight: '600',
  },
  savedList: {
    maxHeight: 320,
    marginBottom: 4,
  },
  savedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#16213e',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  savedRowMain: {
    flex: 1,
  },
  savedName: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  savedMeta: {
    color: '#888',
    fontSize: 12,
    marginTop: 2,
  },
  savedDelete: {
    paddingHorizontal: 8,
  },
  emptyText: {
    color: '#888',
    fontSize: 14,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 20,
  },
});
