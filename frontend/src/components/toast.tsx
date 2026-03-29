type Props = { message: string; type: 'success' | 'error'; onDismiss: () => void };

export function Toast({ message, type, onDismiss }: Props) {
  return (
    <div className={`fixed bottom-4 right-4 px-4 py-3 rounded shadow-lg text-white
      ${type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}>
      <span>{message}</span>
      <button onClick={onDismiss} className="ml-4 font-bold">×</button>
    </div>
  );
}
