<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { request } from '@/api/request'

const route = useRoute()
const id = Number(route.params.id)

const record = ref<Record<string, unknown> | null>(null)
const loading = ref(true)

onMounted(async () => {
  try {
    const res = await request<Record<string, unknown>>(`/inspection/${id}`)
    if (res.code === 0 && res.data) {
      record.value = res.data
    }
  } catch (e) {
    console.error('加载详情失败:', e)
  } finally {
    loading.value = false
  }
})

const fields = [
  ['plate_number', '车牌号'], ['plate_number_gc', '挂车牌号'],
  ['driver_phone', '司机电话'],
  ['vehicle_name', '货车类型'], ['vehicle_container_name', '货箱类型'],
  ['goods_name', '货物名称'], ['goods_category', '货物分类'],
  ['load_rate', '满载率'], ['load_weight', '装载重量(kg)'],
  ['vehicle_size', '车辆尺寸'],
  ['operator_name', '操作员'], ['reviewer_name', '复核人'],
  ['result_status', '检测结果'],
  ['no_pass_type', '不合格类型'],
  ['inspection_time', '检测时间'],
]
</script>

<template>
  <div class="detail-page">
    <h2>检测详情 #{{ id }}</h2>

    <div v-if="loading" class="loading">加载中...</div>

    <div v-else-if="record" class="detail-card">
      <div class="field-grid">
        <div v-for="[key, label] in fields" :key="key" class="field-item">
          <label>{{ label }}:</label>
          <span>{{ record[key] ?? '--' }}</span>
        </div>
      </div>

      <!-- 图片区 -->
      <div class="image-section">
        <h3>图像记录</h3>
        <div class="image-grid">
          <div class="img-item">
            <span class="img-label">车头照</span>
            <img v-if="record.head_image_path" :src="record.head_image_path as string" alt="车头" />
            <span v-else class="img-empty">--</span>
          </div>
          <div class="img-item">
            <span class="img-label">车尾照</span>
            <img v-if="record.tail_image_path" :src="record.tail_image_path as string" alt="车尾" />
            <span v-else class="img-empty">--</span>
          </div>
          <div class="img-item">
            <span class="img-label">车身影像</span>
            <img v-if="record.body_image_path" :src="record.body_image_path as string" alt="车身" />
            <span v-else class="img-empty">--</span>
          </div>
          <div class="img-item">
            <span class="img-label">透视影像</span>
            <img v-if="record.transparent_image_path" :src="record.transparent_image_path as string" alt="透视" />
            <span v-else class="img-empty">--</span>
          </div>
        </div>
      </div>
    </div>

    <div v-else class="empty">记录不存在</div>
  </div>
</template>

<style scoped lang="scss">
.detail-page {
  padding: 20px;
  max-width: 1000px;
  margin: 0 auto;

  h2 { margin-bottom: 16px; font-size: 20px; }
}

.loading, .empty {
  text-align: center;
  padding: 60px;
  color: #999;
}

.field-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px 24px;
}

.field-item {
  display: flex;
  gap: 8px;
  font-size: 14px;

  label {
    color: #666;
    min-width: 100px;
    text-align: right;
  }
}

.image-section {
  margin-top: 24px;

  h3 {
    margin-bottom: 12px;
    font-size: 16px;
  }
}

.image-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}

.img-item {
  display: flex;
  flex-direction: column;
  align-items: center;

  img {
    width: 200px;
    height: 150px;
    object-fit: cover;
    border: 1px solid #eee;
    border-radius: 4px;
  }

  .img-label {
    font-size: 12px;
    color: #999;
    margin-bottom: 4px;
  }

  .img-empty {
    width: 200px;
    height: 150px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #f5f5f5;
    border: 1px dashed #ddd;
    border-radius: 4px;
    color: #ccc;
  }
}
</style>
