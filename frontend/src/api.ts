interface ValidationError {
  loc: (string | number)[];
  msg: string;
  type: string;
}

interface HTTPValidationError {
  detail: ValidationError[];
}

export async function uploadReceipt(file: File, filename: string): Promise<any> {
  const formData = new FormData();
  formData.append('receipt', file);

  const response = await fetch(`/upload?filename=${encodeURIComponent(filename)}`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const errorData: HTTPValidationError = await response.json();
    throw new Error(JSON.stringify(errorData));
  }

  return response.json();
}

export async function getReceipts(): Promise<any> {
  const response = await fetch(`/receipt`, {
    method: 'GET',
  });

  if (!response.ok) {
    const errorData: HTTPValidationError = await response.json();
    throw new Error(JSON.stringify(errorData));
  }

  return response.json();
}

export async function getLineItems(id: number): Promise<any> {
  const response = await fetch(`/receipt/${id}`, {
    method: 'GET',
  });

  if (!response.ok) {
    const errorData: HTTPValidationError = await response.json();
    throw new Error(JSON.stringify(errorData));
  }

  return response.json();
}
