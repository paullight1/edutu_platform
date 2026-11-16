const mockRequest = jest.fn();
const mockUploadAsync = jest.fn();

jest.mock('../packages/core/src/services/productApi', () => ({
  requestProductApi: (...args: unknown[]) => mockRequest(...args),
}));

jest.mock('expo-file-system/legacy', () => ({
  uploadAsync: (...args: unknown[]) => mockUploadAsync(...args),
  FileSystemUploadType: { BINARY_CONTENT: 0 },
}));

const { uploadDocument } = require('../packages/core/src/services/uploads');

const getAuthToken = async () => 'token_abc';
const file = {
  uri: 'file:///tmp/cv.pdf',
  name: 'cv.pdf',
  mimeType: 'application/pdf',
};

describe('uploadDocument', () => {
  beforeEach(() => {
    mockRequest.mockReset();
    mockUploadAsync.mockReset();
  });

  it('reserves, PUTs the file, then ingests — in order', async () => {
    mockRequest
      .mockResolvedValueOnce({
        uploadId: 'up_1',
        uploadUrl: 'https://signed.example/put',
        storagePath: 'user_1/up_1-cv.pdf',
      })
      .mockResolvedValueOnce({ uploadId: 'up_1', parseStatus: 'done', chars: 1200 });
    mockUploadAsync.mockResolvedValue({ status: 200 });

    const result = await uploadDocument(file, { kind: 'cv' }, getAuthToken);

    expect(result).toEqual({ uploadId: 'up_1', parseStatus: 'done' });
    // 1) POST /uploads  2) PUT to signed url  3) POST /uploads/:id/ingest
    expect(mockRequest.mock.calls[0][0]).toBe('/uploads');
    expect(mockUploadAsync).toHaveBeenCalledWith(
      'https://signed.example/put',
      'file:///tmp/cv.pdf',
      expect.objectContaining({ httpMethod: 'PUT' }),
    );
    expect(mockRequest.mock.calls[1][0]).toBe('/uploads/up_1/ingest');
  });

  it('throws if the signed-upload step fails', async () => {
    mockRequest.mockResolvedValueOnce(null);
    await expect(
      uploadDocument(file, {}, getAuthToken),
    ).rejects.toThrow(/could not start/i);
    expect(mockUploadAsync).not.toHaveBeenCalled();
  });

  it('throws if the file PUT fails', async () => {
    mockRequest.mockResolvedValueOnce({
      uploadId: 'up_1',
      uploadUrl: 'https://signed.example/put',
      storagePath: 'p',
    });
    mockUploadAsync.mockResolvedValue({ status: 403 });
    await expect(uploadDocument(file, {}, getAuthToken)).rejects.toThrow(
      /uploading the file failed/i,
    );
  });
});
