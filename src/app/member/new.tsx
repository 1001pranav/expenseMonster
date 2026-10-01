import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { insert, update } from '@/db/repo';
import { MEMBER_COLORS } from '@/db/seed';
import { useMembers } from '@/data/hooks';
import { isValidUpiId } from '@/services/upi';
import { Avatar } from '@/ui/components/Avatar';
import { Button } from '@/ui/components/core';
import { toast } from '@/ui/components/feedback';
import { Field, TextField } from '@/ui/components/forms';
import { Screen } from '@/ui/components/Screen';
import { space } from '@/ui/theme';

export default function MemberForm() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const members = useMembers();
  const existing = members.find((m) => m.id === id);
  const [name, setName] = useState(existing?.name ?? '');
  const [upiId, setUpiId] = useState(existing?.upiId ?? '');
  const [phone, setPhone] = useState(existing?.phone ?? '');
  const [color, setColor] = useState(existing?.color ?? MEMBER_COLORS[members.length % MEMBER_COLORS.length]);

  const save = async () => {
    if (!name.trim()) return toast('Enter a name', { tone: 'error' });
    if (upiId && !isValidUpiId(upiId)) return toast('That UPI ID looks wrong (name@bank)', { tone: 'error' });
    const data = { name: name.trim(), upiId: upiId.trim() || null, phone: phone.trim() || null, color, scope: 'household' as const };
    if (existing) await update('members', existing.id, data);
    else await insert('members', data);
    router.back();
  };

  return (
    <Screen title={existing ? 'Edit member' : 'Add family member'} back footer={<Button title="Save" icon="checkmark" size="lg" onPress={save} />}>
      <View style={{ alignItems: 'center' }}>
        <Avatar name={name || '?'} color={color} size={72} />
      </View>
      <TextField label="Name" value={name} onChangeText={setName} placeholder="Priya, Amma, Ravi…" autoCapitalize="words" />
      <TextField label="UPI ID (optional)" value={upiId} onChangeText={setUpiId} placeholder="priya@oksbi — for one-tap settle up" autoCapitalize="none" icon="at" />
      <TextField label="Phone (optional)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
      <Field label="Colour">
        <View style={{ flexDirection: 'row', gap: space(1.25), flexWrap: 'wrap' }}>
          {MEMBER_COLORS.map((c) => (
            <Pressable key={c} onPress={() => setColor(c)} accessibilityRole="button" accessibilityState={{ selected: color === c }} accessibilityLabel={`Colour ${c}`} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: c, borderWidth: color === c ? 3 : 0, borderColor: '#A5B4FC' }} />
          ))}
        </View>
      </Field>
    </Screen>
  );
}
