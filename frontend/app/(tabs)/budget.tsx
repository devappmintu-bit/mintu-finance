import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import api from '../../utils/api';

const CATEGORIES = [
  'Food',
  'Transport',
  'Shopping',
  'Bills',
  'Entertainment',
  'Healthcare',
  'Education',
  'Investment',
  'Other',
];

const PERIODS = ['daily', 'weekly', 'monthly'];

export default function BudgetScreen() {
  const [budgets, setBudgets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [formData, setFormData] = useState({
    category: 'Food',
    amount: '',
    period: 'monthly',
  });

  useEffect(() => {
    fetchBudgets();
  }, []);

  const fetchBudgets = async () => {
    try {
      const response = await api.get('/budgets');
      setBudgets(response.data);
    } catch (error) {
      console.error('Failed to fetch budgets:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddBudget = async () => {
    if (!formData.amount) {
      Alert.alert('Error', 'Please enter budget amount');
      return;
    }

    try {
      await api.post('/budgets', {
        ...formData,
        amount: parseFloat(formData.amount),
      });
      setModalVisible(false);
      setFormData({ category: 'Food', amount: '', period: 'monthly' });
      fetchBudgets();
    } catch (error) {
      Alert.alert('Error', 'Failed to add budget');
    }
  };

  const handleDeleteBudget = async (id: string) => {
    Alert.alert('Delete Budget', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/budgets/${id}`);
            fetchBudgets();
          } catch (error) {
            Alert.alert('Error', 'Failed to delete budget');
          }
        },
      },
    ]);
  };

  const getProgressColor = (spent: number, amount: number) => {
    const percentage = (spent / amount) * 100;
    if (percentage >= 100) return '#EF4444';
    if (percentage >= 80) return '#F59E0B';
    return '#10B981';
  };

  const renderBudget = ({ item }: { item: any }) => {
    const percentage = Math.min((item.spent / item.amount) * 100, 100);
    const remaining = Math.max(item.amount - item.spent, 0);

    return (
      <TouchableOpacity
        style={styles.budgetCard}
        onLongPress={() => handleDeleteBudget(item.id)}
      >
        <View style={styles.budgetHeader}>
          <View>
            <Text style={styles.budgetCategory}>{item.category}</Text>
            <Text style={styles.budgetPeriod}>
              {item.period.charAt(0).toUpperCase() + item.period.slice(1)} Budget
            </Text>
          </View>
          <View style={styles.budgetAmountContainer}>
            <Text style={styles.budgetAmount}>₹{item.amount.toFixed(0)}</Text>
          </View>
        </View>

        <View style={styles.progressBarContainer}>
          <View style={styles.progressBar}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${percentage}%`,
                  backgroundColor: getProgressColor(item.spent, item.amount),
                },
              ]}
            />
          </View>
          <Text style={styles.progressText}>{percentage.toFixed(0)}%</Text>
        </View>

        <View style={styles.budgetFooter}>
          <View>
            <Text style={styles.footerLabel}>Spent</Text>
            <Text style={[styles.footerValue, { color: '#EF4444' }]}>
              ₹{item.spent.toFixed(0)}
            </Text>
          </View>
          <View>
            <Text style={styles.footerLabel}>Remaining</Text>
            <Text style={[styles.footerValue, { color: '#10B981' }]}>
              ₹{remaining.toFixed(0)}
            </Text>
          </View>
        </View>

        {percentage >= 80 && (
          <View
            style={[
              styles.alert,
              { backgroundColor: percentage >= 100 ? '#EF444420' : '#F59E0B20' },
            ]}
          >
            <Ionicons
              name="warning"
              size={16}
              color={percentage >= 100 ? '#EF4444' : '#F59E0B'}
            />
            <Text
              style={[
                styles.alertText,
                { color: percentage >= 100 ? '#EF4444' : '#F59E0B' },
              ]}
            >
              {percentage >= 100 ? 'Budget exceeded!' : 'Nearing budget limit'}
            </Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color="#10B981" style={{ marginTop: 100 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Budget</Text>
        <TouchableOpacity style={styles.addButton} onPress={() => setModalVisible(true)}>
          <Ionicons name="add" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      <FlatList
        data={budgets}
        renderItem={renderBudget}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="wallet-outline" size={64} color="#475569" />
            <Text style={styles.emptyText}>No budgets set</Text>
            <Text style={styles.emptySubtext}>Set a budget to track your spending!</Text>
          </View>
        }
      />

      {/* Add Budget Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalContainer}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Set Budget</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            <ScrollView>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Category</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {CATEGORIES.map((cat) => (
                    <TouchableOpacity
                      key={cat}
                      style={[
                        styles.categoryChip,
                        formData.category === cat && styles.categoryChipActive,
                      ]}
                      onPress={() => setFormData({ ...formData, category: cat })}
                    >
                      <Text
                        style={[
                          styles.categoryChipText,
                          formData.category === cat && styles.categoryChipTextActive,
                        ]}
                      >
                        {cat}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Period</Text>
                <View style={styles.periodSelector}>
                  {PERIODS.map((period) => (
                    <TouchableOpacity
                      key={period}
                      style={[
                        styles.periodButton,
                        formData.period === period && styles.periodButtonActive,
                      ]}
                      onPress={() => setFormData({ ...formData, period })}
                    >
                      <Text
                        style={[
                          styles.periodButtonText,
                          formData.period === period && styles.periodButtonTextActive,
                        ]}
                      >
                        {period.charAt(0).toUpperCase() + period.slice(1)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Budget Amount (₹)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="0"
                  placeholderTextColor="#64748B"
                  value={formData.amount}
                  onChangeText={(text) => setFormData({ ...formData, amount: text })}
                  keyboardType="numeric"
                />
              </View>

              <TouchableOpacity style={styles.submitButton} onPress={handleAddBudget}>
                <Text style={styles.submitButtonText}>Set Budget</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
  },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#10B981',
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    padding: 16,
  },
  budgetCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  budgetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  budgetCategory: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  budgetPeriod: {
    fontSize: 12,
    color: '#94A3B8',
  },
  budgetAmountContainer: {
    backgroundColor: '#334155',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  budgetAmount: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#10B981',
  },
  progressBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  progressBar: {
    flex: 1,
    height: 8,
    backgroundColor: '#334155',
    borderRadius: 4,
    overflow: 'hidden',
    marginRight: 12,
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  progressText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#CBD5E1',
    width: 40,
    textAlign: 'right',
  },
  budgetFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  footerLabel: {
    fontSize: 12,
    color: '#94A3B8',
    marginBottom: 4,
  },
  footerValue: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  alert: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    marginTop: 12,
  },
  alertText: {
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 8,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#CBD5E1',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#64748B',
    marginTop: 8,
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalContent: {
    backgroundColor: '#1E293B',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  inputGroup: {
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    color: '#CBD5E1',
    marginBottom: 12,
    fontWeight: '500',
  },
  input: {
    backgroundColor: '#334155',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#fff',
    borderWidth: 1,
    borderColor: '#475569',
  },
  categoryChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#334155',
    marginRight: 8,
  },
  categoryChipActive: {
    backgroundColor: '#4F46E5',
  },
  categoryChipText: {
    fontSize: 14,
    color: '#94A3B8',
  },
  categoryChipTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  periodSelector: {
    flexDirection: 'row',
    gap: 8,
  },
  periodButton: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
  },
  periodButtonActive: {
    backgroundColor: '#4F46E5',
    borderColor: '#4F46E5',
  },
  periodButtonText: {
    fontSize: 14,
    color: '#94A3B8',
  },
  periodButtonTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  submitButton: {
    backgroundColor: '#10B981',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});